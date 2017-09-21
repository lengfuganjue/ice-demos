// **********************************************************************
//
// Copyright (c) 2003-2017 ZeroC, Inc. All rights reserved.
//
// **********************************************************************

const Ice = require("ice").Ice;
const Glacier2 = require("ice").Glacier2;
const Demo = require("./generated/Chat").Demo;

//
// Servant that implements the ChatCallback interface,
// the message operation just writes the received data
// to stdout.
//
class ChatCallbackI extends Demo.ChatCallback
{
    message(data)
    {
        console.log(data);
    }
}

(async function()
{
    let communicator;

    async function destroy()
    {
        if(communicator)
        {
            try
            {
                await communicator.destroy();
            }
            catch(ex)
            {
            }
        }
    }
    //
    // Destroy communicator on SIGINT so application
    // exit cleanly.
    //
    process.once("SIGINT", async () => destroy());

    let status = 0;
    try
    {
        //
        // Initialize the communicator with Ice.Default.Router property
        // set to the simple chat demo Glacier2 router.
        //
        const initData = new Ice.InitializationData();
        initData.properties = Ice.createProperties();
        initData.properties.setProperty("Ice.Default.Router", "DemoGlacier2/router:tcp -p 4063 -h localhost");
        communicator = Ice.initialize(process.argv, initData);

        async function createSession()
        {
            try
            {
                //
                // Get a proxy to the default rotuer and down-cast it to Glacier2.Router
                // interface to ensure Glacier2 server is available.
                //
                const router = await Glacier2.RouterPrx.checkedCast(communicator.getDefaultRouter());

                console.log("This demo accepts any user-id / password combination.");
                process.stdout.write("user id: ");
                const id = await getline();
                process.stdout.write("password: ");
                const password = await getline();
                const session = await router.createSession(id, password);

                await runWithSession(router, Demo.ChatSessionPrx.uncheckedCast(session));
                console.log("run with session end");
            }
            catch(ex)
            {
                if(ex instanceof Glacier2.PermissionDeniedException)
                {
                    console.log("permission denied:\n" + ex.reason);
                    await createSession();
                }
                else if(ex instanceof Glacier2.CannotCreateSessionException)
                {
                    console.log("cannot create session:\n" + ex.reason);
                    await createSession();
                }
                else
                {
                    throw ex;
                }
            }
        }

        async function runWithSession(router, session)
        {
            //
            // Get the session timeout, the router client category and
            // create the client object adapter.
            //
            // Use Promise.all to wait for the completion of all the
            // calls.
            //
            let [timeout, category, adapter] = await Promise.all([router.getACMTimeout(),
                                                                  router.getCategoryForClient(),
                                                                  communicator.createObjectAdapterWithRouter("", router)]);

            //
            // Use ACM heartbeat to keep session alive.
            //
            const connection = router.ice_getCachedConnection();
            if(timeout > 0)
            {
                connection.setACM(timeout, undefined, Ice.ACMHeartbeat.HeartbeatAlways);
            }

            connection.setCloseCallback(() => console.log("Connection lost"));

            //
            // Create the ChatCallback servant and add it to the ObjectAdapter.
            //
            const callback = Demo.ChatCallbackPrx.uncheckedCast(
                adapter.add(new ChatCallbackI(), new Ice.Identity("callback", category)));

            //
            // Set the chat session callback.
            //
            await session.setCallback(callback);

            //
            // The chat function sequantially reads stdin messages
            // and send it to server using the session say method.
            //
            async function chat()
            {
                while(true)
                {
                    process.stdout.write("==> ");
                    const msg = await getline();

                    if(msg == "/quit")
                    {
                        //
                        // We are not longer interested in being notified of
                        // connection closure.
                        //
                        connection.setCloseCallback(null);
                        if(communicator)
                        {
                            try
                            {
                                await communicator.destroy();
                            }
                            catch(ex)
                            {
                            }
                        }
                        break;
                    }
                    else if(msg.indexOf("/") === 0)
                    {
                        console.log("enter /quit to exit.");
                    }
                    else
                    {
                        await session.say(msg);
                    }
                }
            }
            await chat();
        }
        await createSession();
    }
    catch(ex)
    {
        status = 1;
        console.log(ex);
        await destroy();
    }
    return status;
}()).then(status => process.exit(status));

//
// Asynchonously process stdin lines using a promise
//
function getline()
{
    return new Promise((resolve, reject) =>
                       {
                           process.stdin.resume();
                           process.stdin.once("data", buffer =>
                                              {
                                                  process.stdin.pause();
                                                  resolve(buffer.toString("utf-8").trim());
                                              });
                       });
}
