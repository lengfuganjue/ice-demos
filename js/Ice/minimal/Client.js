
//
// Copyright (c) 2003-2017 ZeroC, Inc. All rights reserved.
//
// **********************************************************************

const Ice = require("ice").Ice;
const Demo = require("./generated/Hello").Demo;

(async function()
{
    let communicator;
    let status = 0;
    try
    {
        //
        // Initialize the communicator and create a proxy to the hello object.
        //
        communicator = Ice.initialize(process.argv);
        if(process.argv.length > 2)
        {
            throw("too many arguments");
        }

        //
        // Down-cast the proxy to the hello object interface and invoke
        // the sayHello method.
        //
        const hello = await Demo.HelloPrx.checkedCast(communicator.stringToProxy("hello:tcp -h localhost -p 10000"));
        await hello.sayHello();
    }
    catch(ex)
    {
        console.log(ex);
        status = 1;
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
    return satus;
})().then(status => process.exit(status));
