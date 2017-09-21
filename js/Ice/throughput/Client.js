// **********************************************************************
//
// Copyright (c) 2003-2017 ZeroC, Inc. All rights reserved.
//
// **********************************************************************

const Ice = require("ice").Ice;
const Demo = require("./generated/Throughput").Demo;

function menu()
{
    process.stdout.write(
`usage:

toggle type of data to send:
1: sequence of bytes (default)
2: sequence of strings (\"hello\")
3: sequence of structs with a string (\"hello\") and a double
4: sequence of structs with two ints and a double

select test to run:
t: Send sequence as twoway
o: Send sequence as oneway
r: Receive sequence
e: Echo (send and receive) sequence

other commands
s: shutdown server
x: exit
?: help
`);
}

//
// Initialize sequences.
//
const byteSeq = new Buffer(Demo.ByteSeqSize);
for(let i = 0; i < Demo.ByteSeqSize; ++i)
{
    byteSeq[i] = 0;
}

const stringSeq = [];
for(let i = 0; i < Demo.StringSeqSize; ++i)
{
    stringSeq[i] = "hello";
}

const structSeq = [];
for(let i = 0; i < Demo.StringDoubleSeqSize; ++i)
{
    structSeq[i] = new Demo.StringDouble("hello", 3.14);
}

const fixedSeq = [];
for(let i = 0; i < Demo.FixedSeqSize; ++i)
{
    fixedSeq[i] = new Demo.Fixed(0, 0, 0);
}

(async function()
{
    let communicator;
    let completed = false;
    let status = 0;
    try
    {
        let currentType = "1";
        const repetitions = 100;

        let seqSize = Demo.ByteSeqSize;
        let seq = byteSeq;
        let wireSize = 1;

        //
        // Initialize the communicator, Create a proxy to the throughput object
        // and down-cast the proxy to the Demo.Throughput interface.
        //
        communicator = Ice.initialize(process.argv);
        if(process.argv.length > 2)
        {
            throw new Error("too many arguments");
        }

        const twoway = await Demo.ThroughputPrx.checkedCast(communicator.stringToProxy("throughput:default -p 10000"));

        const oneway = twoway.ice_oneway();
        menu();
        process.stdout.write("==> ");

        async function processKey(key)
        {
            if(key == "x")
            {
                completed = true;
                return communicator.destroy();
            }

            let proxy;
            let operation;

            if(key == "1" || key == "2" || key == "3" || key == "4")
            {
                currentType = key;

                //
                // Select the sequence data type to use by this test.
                //
                switch(currentType)
                {
                    case "1":
                    {
                        console.log("using byte sequences");
                        seqSize = Demo.ByteSeqSize;
                        seq = byteSeq;
                        wireSize = 1;
                        break;
                    }

                    case "2":
                    {
                        console.log("using string sequences");
                        seqSize = Demo.StringSeqSize;
                        seq = stringSeq;
                        wireSize = seq[0].length;
                        break;
                    }

                    case "3":
                    {
                        console.log("using variable-length struct sequences");
                        seqSize = Demo.StringDoubleSeqSize;
                        seq = structSeq;
                        wireSize = seq[0].s.length;
                        wireSize += 8; // Size of double on the wire.
                        break;
                    }

                    case "4":
                    {
                        console.log("using fixed-length struct sequences");
                        seqSize = Demo.FixedSeqSize;
                        seq = fixedSeq;
                        wireSize = 16; // Size of two ints and a double on the wire.
                        break;
                    }
                }
            }
            else if(key == "t" || key == "o" || key == "r" || key == "e")
            {
                //
                // Select the proxy and operation to use by this test.
                //
                switch(key)
                {
                    case "t":
                    case "o":
                    {
                        proxy = key == "o" ? oneway : twoway;
                        if(currentType == 1)
                        {
                            operation = proxy.sendByteSeq;
                        }
                        else if(currentType == 2)
                        {
                            operation = proxy.sendStringSeq;
                        }
                        else if(currentType == 3)
                        {
                            operation = proxy.sendStructSeq;
                        }
                        else if(currentType == 4)
                        {
                            operation = proxy.sendFixedSeq;
                        }
                        process.stdout.write("sending");
                        break;
                    }

                    case "r":
                    {
                        proxy = twoway;
                        if(currentType == 1)
                        {
                            operation = proxy.recvByteSeq;
                        }
                        else if(currentType == 2)
                        {
                            operation = proxy.recvStringSeq;
                        }
                        else if(currentType == 3)
                        {
                            operation = proxy.recvStructSeq;
                        }
                        else if(currentType == 4)
                        {
                            operation = proxy.recvFixedSeq;
                        }
                        process.stdout.write("receiving");
                        break;
                    }

                    case "e":
                    {
                        proxy = twoway;
                        if(currentType == 1)
                        {
                            operation = proxy.echoByteSeq;
                        }
                        else if(currentType == 2)
                        {
                            operation = proxy.echoStringSeq;
                        }
                        else if(currentType == 3)
                        {
                            operation = proxy.echoStructSeq;
                        }
                        else if(currentType == 4)
                        {
                            operation = proxy.echoFixedSeq;
                        }
                        process.stdout.write("sending and receiving");
                        break;
                    }
                }

                process.stdout.write(" " + repetitions);
                switch(currentType)
                {
                    case "1":
                    {
                        process.stdout.write(" byte");
                        break;
                    }
                    case "2":
                    {
                        process.stdout.write(" string");
                        break;
                    }
                    case "3":
                    {
                        process.stdout.write(" variable-length struct");
                        break;
                    }

                    case "4":
                    {
                        process.stdout.write(" fixed-length struct");
                        break;
                    }
                }

                process.stdout.write(" sequences of size " + seqSize);

                if(key == "o")
                {
                    process.stdout.write(" as oneway");
                }
                console.log("...");

                let start = new Date().getTime();
                let args = key != "r" ? [seq] : [];

                for(let i = 0; i < repetitions; i++)
                {
                    await operation.apply(proxy, args);
                }

                let total = new Date().getTime() - start;
                console.log("time for " + repetitions + " sequences: " + total  + " ms");
                console.log("time per sequence: " + total / repetitions + " ms");

                let mbit = repetitions * seqSize * wireSize * 8.0 / total / 1000.0;
                if(key == "e")
                {
                    mbit *= 2;
                }
                mbit = Math.round(mbit * 100) / 100;
                console.log("throughput: " + mbit + " Mbps");
            }
            else if(key == "s")
            {
                return twoway.shutdown();
            }
            else if(key == "?")
            {
                process.stdout.write("\n");
                menu();
            }
            else
            {
                console.log("unknown command `" + key + "'");
                process.stdout.write("\n");
                menu();
            }
        }

        //
        // Process keys sequentially. We chain the promise objects
        // returned by processKey(). Once we have process all the
        // keys we print the prompt and resume the standard input.
        //
        process.stdin.resume();
        process.stdin.on("data", async (buffer) =>
                         {
                             process.stdin.pause();
                             for(let key of buffer.toString("utf-8").trim().split(""))
                             {
                                 try
                                 {
                                     await processKey(key);
                                 }
                                 catch(ex)
                                 {
                                     console.log(ex);
                                 }
                             }

                             if(!completed)
                             {
                                 process.stdout.write("==> ");
                                 process.stdin.resume();
                             }
                         });
        await communicator.waitForShutdown();
    }
    catch(ex)
    {
        status = 1;
        try
        {
            await communicator.destroy();
        }
        catch(ex)
        {
        }
    }
    return status;
}()).then(status => process.exit(status));
