// **********************************************************************
//
// Copyright (c) 2003-2017 ZeroC, Inc. All rights reserved.
//
// **********************************************************************

(function(){

//
// Servant that implements the ChatCallback interface.
// The message operation just writes the received data
// to the output textarea.
//
class ChatCallbackI extends Demo.ChatCallback
{
    message(data)
    {
        $("#output").val($("#output").val() + data + "\n");
        $("#output").scrollTop($("#output").get(0).scrollHeight);
    }
}

//
// Chat client state
//
const State =
{
    Disconnected: 0,
    Connecting: 1,
    Connected:2
};

let state = State.Disconnected;
let hasError = false;

async function signin()
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

    try
    {
        state = State.Connecting;
        //
        // Dismiss any previous error message.
        //
        if(hasError)
        {
            await dismissError();
        }
        //
        // Transition to loading screen
        //
        await transition("#signin-form", "#loading");

        //
        // Start animating the loading progress bar.
        //
        await startProgress();

        const hostname = document.location.hostname || "127.0.0.1";
        //
        // If the demo is accessed vi https, use a secure (WSS) endpoint, otherwise
        // use a non-secure (WS) endpoint.
        //
        // The web server will act as a reverse proxy for WebSocket connections. This
        // facilitates the setup of WSS with self-signed certificates because Firefox
        // and Internet Explorer certificate exceptions are only valid for the same
        // port and host.
        //
        const secure = document.location.protocol.indexOf("https") != -1;
        const proxy = secure ? "DemoGlacier2/router:wss -p 9090 -h " + hostname + " -r /chatwss" :
              "DemoGlacier2/router:ws -p 8080 -h " + hostname + " -r /chatws";

        //
        // Initialize the communicator with the Ice.Default.Router property
        // set to the simple chat demo Glacier2 router.
        //
        const initData = new Ice.InitializationData();
        initData.properties = Ice.createProperties();
        initData.properties.setProperty("Ice.Default.Router", proxy);
        communicator = Ice.initialize(initData);

        //
        // Get a proxy to the Glacier2 router using checkedCast to ensure
        // the Glacier2 server is available.
        //
        const router = await Glacier2.RouterPrx.checkedCast(communicator.getDefaultRouter());

        const username = $("#username").val();
        const password = $("#password").val();

        const session = Demo.ChatSessionPrx.uncheckedCast(await router.createSession(username, password));

        try
        {
            try
            {
                //
                // Get the session timeout and the router client category, and
                // create the client object adapter.
                //
                // Use Promise.all to wait for the completion of all the
                // calls.
                //
                let [timeout, category, adapter] = await Promise.all(
                    [router.getACMTimeout(),
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

                connection.setCloseCallback(() => error("Connection lost"));

                //
                // Create the ChatCallback servant and add it to the
                // ObjectAdapter.
                //
                const callback = Demo.ChatCallbackPrx.uncheckedCast(
                    adapter.add(new ChatCallbackI(), new Ice.Identity("callback", category)));

                //
                // Set the chat session callback.
                //
                await session.setCallback(callback);

                //
                // Stop animating the loading progress bar and
                // transition to the chat screen.
                //
                stopProgress(true);
                await transition("#loading", "#chat-form");

                $("#loading .meter").css("width", "0%");
                state = State.Connected;
                $("#input").focus();

                //
                // Process input events in the input textbox 
                //
                await new Promise(
                    async (resolve, reject) =>
                        {
                            $("#input").keypress(e =>
                                                 {
                                                     if(communicator)
                                                     {
                                                         //
                                                         // When the enter key is pressed, we send a new
                                                         // message using the session say operation and
                                                         // reset the textbox contents.
                                                         //
                                                         if(e.which === 13)
                                                         {
                                                             var message = $(e.currentTarget).val();
                                                             $(e.currentTarget).val("");
                                                             session.say(message).catch(ex => reject(ex));
                                                             return false;
                                                         }
                                                     }
                                                 });

                            //
                            // Exit the chat by resolving the promise.
                            //
                            $("#signout").click(() =>
                                                {
                                                    //
                                                    // We are no longer interested in being notify about
                                                    // connection closure.
                                                    //
                                                    connection.setCloseCallback(null);
                                                    resolve();
                                                    return false;
                                                });
                        });
            }
            finally
            {
                //
                // Reset the input text box and chat output
                // textarea.
                //
                $("#input").val("");
                $("#input").off("keypress");
                $("#signout").off("click");
                $("#output").val("");

                //
                // Destroy the session.
                //
                await router.destroySession();
            }
            //
            // Destroy the communicator and go back to the
            // disconnected state.
            //
            await communicator.destroy();

            await transition("#chat-form", "#signin-form");
            $("#username").focus();
            state = State.Disconnected;
        }
        catch(ex)
        {
            //
            // Handle any exceptions that occurred while running.
            //
            await error(ex);
            await destroy();
        }
    }
    catch(ex)
    {
        //
        // Handle any exceptions that occurred during session creation.
        //
        if(ex instanceof Glacier2.PermissionDeniedException)
        {
            await error("permission denied:\n" + ex.reason);
        }
        else if(ex instanceof Glacier2.CannotCreateSessionException)
        {
            await error("cannot create session:\n" + ex.reason);
        }
        else if(ex instanceof Ice.ConnectFailedException)
        {
            await error("connection to server failed");
        }
        else
        {
            await error(ex.toString());
        }

        await destroy();
    }
}

//
// Switch to Disconnected state and display the error
// message.
//
async function error(message)
{
    stopProgress(false);
    hasError = true;
    const current = state === State.Connecting ? "#loading" : "#chat-form";
    $("#signin-alert span").text(message);

    //
    // Transition the screen
    //
    await transition(current, "#signin-alert");

    $("#loading .meter").css("width", "0%");
    $("#signin-form").css("display", "block").animo({ animation: "flipInX", keep: true });
    state = State.Disconnected;
}

//
// Do a transition from "from" screen to "to" screen, return
// a promise that allows us to wait for the transition
// to complete. If to screen is undefined just animate out the
// from screen.
//
function transition(from, to)
{
    return new Promise(
        (resolve, reject) =>
            {
                $(from).animo({ animation: "flipOutX", keep: true },
                              () =>
                              {
                                  $(from).css("display", "none");
                                  if(to)
                                  {
                                      $(to).css("display", "block").animo({ animation: "flipInX", keep: true }, () => resolve());
                                  }
                                  else
                                  {
                                      resolve();
                                  }
                              });
            });
}

//
// Event handler for Sign in button
//
$("#signin").click(() =>
                   {
                       signin();
                       return false;
                   });

//
// Dismiss error message.
//
async function dismissError()
{
    await transition("#signin-alert");
    hasError = false;
}

//
// Animate the loading progress bar.
//
var w = 0;
var progress;

function startProgress()
{
    if(!progress)
    {
        progress = setInterval(() =>
            {
                w = w === 100 ? 0 : w + 5;
                $("#loading .meter").css("width", w.toString() + "%");
            },
            20);
    }
}

function stopProgress(completed)
{
    if(progress)
    {
        clearInterval(progress);
        progress = null;
        if(completed)
        {
            $("#loading .meter").css("width", "100%");
        }
    }
}

$("#username").focus();

}());
