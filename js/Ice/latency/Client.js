// **********************************************************************
//
// Copyright (c) 2003-2017 ZeroC, Inc. All rights reserved.
//
// **********************************************************************

const Ice = require("ice").Ice;
const Demo = require("./generated/Latency").Demo;

(async function()
{
    let communicator;
    let status = 0;
    try
    {
        //
        // Initialize the communicator, create a proxy to the ping object and
        // down-cast the proxy to the Demo.Ping interface
        //
        communicator = Ice.initialize(process.argv);
        if(process.argv.length > 2)
        {
            throw new Error("too many arguments");
        }
        const repetitions = 1000;
        const proxy = await Demo.PingPrx.checkedCast(communicator.stringToProxy("ping:default -p 10000"));

        console.log("pinging server " + repetitions + " times (this may take a while)");
        const start = new Date().getTime();

        for(let i = 0; i < repetitions; ++i)
        {
            await proxy.ice_ping();
        }
        const total = new Date().getTime() - start;
        console.log("time for " + repetitions + " pings: " + total + "ms");
        console.log("time per ping: " + (total / repetitions) + "ms");
    }
    catch(ex)
    {
        status = 1;
        console.log(ex);
    }
    finally
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
    return status;
})().then(status => process.exit(status));
