import dotenv from 'dotenv';
dotenv.config();

import { Client, Events, GatewayIntentBits } from 'discord.js';
import { Client as AppwriteClient, Users, Databases, Permission, Role, Query, ID } from 'node-appwrite';

import express from 'express';

import bodyParser from 'body-parser';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const app = express()
const port = process.env.PORT || 3000

const lineItems = [
    {
      price_data: {
        unit_amount: 500, // $5.00
        currency: 'usd',
        product_data: {
          name: '1 Week',
        },
      },
      quantity: 1,
    },
    {
      price_data: {
        unit_amount: 1000, // $10.00
        currency: 'usd',
        product_data: {
          name: '1 Month',
        },
      },
      quantity: 1,
    },
    {
      price_data: {
        unit_amount: 2500, // $25.00
        currency: 'usd',
        product_data: {
          name: '3 Months',
        },
      },
      quantity: 1,
    },
    {
      price_data: {
        unit_amount: 4500, // $45.00
        currency: 'usd',
        product_data: {
          name: '6 Months',
        },
      },
      quantity: 1,
    },
    {
      price_data: {
        unit_amount: 8500, // $85.00
        currency: 'usd',
        product_data: {
          name: '1 Year',
        },
      },
      quantity: 1,
    }
  ];

let client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.GuildMessages
    ],
  });

const appwriteClient = new AppwriteClient()
  .setEndpoint(process.env.APPWRITE_ENDPOINT) //https://fra.cloud.appwrite.io/v1
  .setProject(process.env.APPWRITE_PROJECT_ID)   //682a090200212195fb22
  .setKey(process.env.APPWRITE_API_KEY); 
  
const users = new Users(appwriteClient);
const db = new Databases(appwriteClient);

async function getAppwriteUserDoc(discordUsername)
{
	if(discordUsername == null)
	{
		return null;
	}
	 const registeredUser = await db.listDocuments(
	  'db',
	  'discordUsers',
	  [
	    Query.equal('discordUsername', [discordUsername])
	  ]
	 );
	 if(registeredUser.documents.total === 0)
	 {
		return null;
	 }
	 else 
	 {
		return registeredUser.documents[0];
	 }
}

async function handleInteraction(interaction) 
{
    if(!interaction.isCommand()) 
    {
        return;
    }

    let message = "";
    try
    {
      	await interaction.deferReply({ ephemeral: true });
      	const { commandName, user, options } = interaction;

      const myUsername = user.username;
      const myAppwriteDoc = await getAppwriteUserDoc(myUsername);
      if(myAppwriteDoc == null)
      {
        message = `You aren't registered. [Register here](https://discord.com/oauth2/authorize?response_type=code&client_id=1373716555539550258&state=%7B"success"%3A"https%3A%5C%2F%5C%2F9000-firebase-preferenceapp-1747585836579.cluster-aj77uug3sjd4iut4ev6a4jbtf2.cloudworkstations.dev%5C%2F%5C%2F"%2C"failure"%3A"https%3A%5C%2F%5C%2F9000-firebase-preferenceapp-1747585836579.cluster-aj77uug3sjd4iut4ev6a4jbtf2.cloudworkstations.dev%5C%2Ffail"%2C"token"%3Afalse%7D&scope=identify+email&redirect_uri=https%3A%2F%2Ffra.cloud.appwrite.io%2Fv1%2Faccount%2Fsessions%2Foauth2%2Fcallback%2Fdiscord%2F682a090200212195fb22) to get started`;
        throw new Error(message);
      }
          
      if (commandName === 'like')
      {
	const theirUsername = options.getString('username') || null;
	const theirAppwriteDoc = await getAppwriteUserDoc(theirUsername);
	if(theirAppwriteDoc == null)
	{
		message = `${theirUsername} isn't registered`;
		throw new Error(message);
	}
	
	const myUser = user;
	const theirUser = await client.users.fetch(theirAppwriteDoc.discordUserId) || null;
	
	const doIAlreadyLikeThem = await db.listDocuments('db', 'likes', [ Query.equal('userA', [myUsername]), Query.equal('userB', theirUsername) ]);
	const doTheyAlreadyLikeMe = await db.listDocuments('db', 'likes', [ Query.equal('userA', [theirUsername]), Query.equal('userB', myUsername) ]);
	      
        if(doIAlreadyLikeThem.total > 0)
        {
          message = `Unable to perform action because you already like ${theirUsername}`;
          throw new Error(message);
        }
        try
        {
          if(doTheyAlreadyLikeMe.total > 0)
          {
            const deleteLike = await db.deleteDocument('db', 'likes', doTheyAlreadyLikeMe.documents[0].$id);
            if(theirUser)
            {
              await theirUser.send(`You matched with ${myUsername}`);
            }
            await myUser.send(`You matched with ${theirUsername}`);
            message = `You matched with ${theirUsername}`;
          }
          else
          {
            const createLike = await db.createDocument('db', 'likes', ID.unique(), { userA: myUsername, userB: theirUsername }, [ Permission.read(Role.user(myAppwriteDoc.$id)) ]);
            const theirSubscription = await db.listDocuments('db', 'subscriptions', [ Query.equal('username', [theirUsername]), Query.limit(1), Query.orderDesc('$createdAt') ]);
            console.log(theirSubscription);
            if(theirSubscription.total > 0)
            {
              //potential parseInt
              const subscriptionDate = new Date(theirSubscription.documents[0].endTimestamp);
              const currentDate = new Date();
              if (subscriptionDate > currentDate) 
              {
                  await theirUser.send(`${myUsername} liked you`);
              }
              else
              {
                await theirUser.send(`Someone liked you. Subscribe to find out who it is`);
              }
            }
            else
            {
              await theirUser.send(`Someone liked you. Subscribe to find out who it is`);
            }
            //await myUser.send(`You liked ${theirUsername}`);
            message = `You liked ${theirUsername}`;


          }
        }
        catch(error)
        {
          message = "An error occurred";
          throw new Error(message);
        }
      }
      else if(commandName === "search")
      {
	const theirUsername = options.getString('username') || null;
	const theirAppwriteDoc = await getAppwriteUserDoc(theirUsername);

      if(theirAppwriteDoc == null)
      {
	message = `${theirUsername} isn't registered`;
      }
      else
      {
	message = `${theirUsername} is registered`;
      }
      }
      else if(commandName === "status")
      {
	      const mySubscription = await db.listDocuments('db', 'subscriptions', [ Query.equal('username', [myUsername]), Query.limit(1), Query.orderDesc('$createdAt') ]);
	
	      if(mySubscription.total > 0)
	      {
		if(mySubscription.documents[0].startTimestamp === mySubscription.documents[0].endTimestamp)
		{
			message = "No subscription history found";
		}
		else
		{
			const subscriptionStartTimestamp = Math.floor(parseInt(theirSubscription.documents[0].startTimestamp)/1000);
			const subscriptionEndTimestamp = Math.floor(parseInt(theirSubscription.documents[0].endTimestamp)/1000);
			
			message = `Your most recent subscription started <t:${subscriptionStartTimestamp.toString()}:R> and will end <t:${subscriptionEndTimestamp.toString()}:R>`;
		}
	      }
	      else
	      {
		message = "No subscription history found. Click (here) to view your most recent admirers for free (one-time use)";
	      }
      }
      else if(commandName === "subscribe")
      {
    	const selectedDuration = interaction.options.getString('duration');
	      //do magic to get the index of which option you've selected
	let index = 0;
	try {
	      const session = await stripe.checkout.sessions.create({
	        payment_method_types: ['card'],
	        line_items: [lineItems[index]],
	        success_url: "https://www.preferenceapp.pages.dev/success",
	        cancel_url: "https://www.preferenceapp.pages.dev/cancel",
	        client_reference_id: myAppwriteDoc.$id + "-" +  ID.unique(),
	        metadata: { 
	          userId: myAppwriteDoc.$id,
	          item: index.toString()
	        },
	        mode: 'payment',
	      });
	
	      if (!session || !session.url) {
		message = 'Failed to create Stripe session.';
	      }
	      message = session.url;
	} 
	catch (err) 
	{
          message = "An error occurred";
          throw new Error(message);
	}
      }
      else if(commandName === "unlike")
      {
        const theirUsername = options.getString('username') || null;
	const doIAlreadyLikeThem = await db.listDocuments('db', 'likes', [ Query.equal('userA', [myUsername]), Query.equal('userB', theirUsername) ]);
	      
        if(doIAlreadyLikeThem.total === 0)
        {
          message = `Unable to perform action because you don't like ${theirUsername}`;
          throw new Error(message);
        }
        try
        {
          const deleteLike = await db.deleteDocument('db', 'likes', doIAlreadyLikeThem.documents[0].$id);
          //await myUser.send(`You unliked ${theirUsername}`);
          message = `You unliked ${theirUsername}`;
        }
        catch(error)
        {
          message = "An error occurred";
          throw new Error(message);
        }
      }
    }
    catch(error)
    {
        console.log(error);
    }
    finally
    {
        if(message === "")
        {
            message = "An error occurred";
        }
        await interaction.editReply({
            content: message,
            ephemeral: true
        });
    }
}

async function reset()
{            
    client.on(Events.InteractionCreate, async interaction => {
    if(!interaction.isCommand()) 
    {
        return;
    }

    await handleInteraction(interaction);
  });
    
  await client.login(process.env.DISCORD_TOKEN);    
}

await reset();

// Use raw body for Stripe webhook validation
app.post('/webhook', bodyParser.raw({ type: 'application/json' }), async (req, res) => {
  
  let event;

  // Validate Stripe signature
  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      req.headers['stripe-signature'],
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('Stripe webhook signature verification failed.', err.message);
    return res.status(401).json({ success: false, error: 'Invalid Stripe signature' });
  }

  // Handle only checkout session completion
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const userId = session.metadata?.userId;
    const item = session.metadata?.item;

    if (!userId) {
      console.error('Missing userId in Stripe session metadata.');
      return res.status(400).json({ success: false, error: 'Missing userId' });
    }

    try {
      const registeredUser = await db.getDocument(
        'db',
        'discordUsers',
        userId
      );
      const timestamp = Date.now();

      let expirationTimestamp = 0;
      const mySubscription = await db.listDocuments('db', 'subscriptions', [ Query.equal('username', [registeredUser.discordUsername]), Query.limit(1), Query.orderDesc('$createdAt') ]);

      if(mySubscription.total > 0)
      {
        expirationTimestamp = mySubscription.documents[0].endTimestamp;
      }

      let newTimestamp = 0;

      if(timestamp > expirationTimestamp)
      {
        newTimestamp = timestamp;
        //We've passed the timestamp we've paid for. Add time to timestamp
      }
      else
      {
        newTimestamp = expirationTimestamp;
        //We haven't expired yet, add time to expirationTimestamp.
      }

      let receipt = "";
      if (item === "0") {
        // 1 week = 7 days * 24 hours * 60 minutes * 60 seconds * 1000 milliseconds
        newTimestamp += 7 * 24 * 60 * 60 * 1000;
	receipt = "You successfully subscribed to Preference for 1 week. Enjoy!"
      } else if (item === "1") {
        // 1 month (approximate) = 30 days
        newTimestamp += 30 * 24 * 60 * 60 * 1000;
	receipt = "You successfully subscribed to Preference for 1 month. Enjoy!"
      } else if (item === "2") {
        // 3 months (approximate) = 3 * 30 days
        newTimestamp += 3 * 30 * 24 * 60 * 60 * 1000;
	receipt = "You successfully subscribed to Preference for 3 months. Enjoy!"
      } else if (item === "3") {
        // 6 months (approximate) = 6 * 30 days
        newTimestamp += 6 * 30 * 24 * 60 * 60 * 1000;
	receipt = "You successfully subscribed to Preference for 6 months. Enjoy!"
      } else if (item === "4") {
        // 1 year (approximate) = 365 days
        newTimestamp += 365 * 24 * 60 * 60 * 1000;
	receipt = "You successfully subscribed to Preference for 1 year. Enjoy!"
      }

      const createSubscription = await db.createDocument('db', 'subscriptions', ID.unique(), { username:registeredUser.discordUsername, startTimestamp: timestamp, endTimestamp: newTimestamp }, [ Permission.read(Role.user(userId)) ]);
      const myUser = await client.users.fetch(registeredUser.discordUserId) || null;
      if(myUser)
      {
        await myUser.send(receipt);
      }
      return res.json({ success: true });
    } catch (err) {
      console.error('Failed to update user:', err);
      return res.status(500).json({ success: false, error: 'Internal server error' });
    }
    
  }

  // Acknowledge other events
  return res.json({ success: true });
});

// This must be after bodyParser.raw for /webhook!
app.use(express.json()); // for other routes


app.get('/', (req, res) => {
    res.json({status: "ok"});
});

app.listen(port, () => {
    console.log(`App is listening on port ${port}`);
});
