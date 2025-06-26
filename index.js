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

let client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.GuildMessages
    ],
  });

const appwriteClient = new AppwriteClient()
  .setEndpoint('https://fra.cloud.appwrite.io/v1')
  .setProject('682a090200212195fb22')       
  .setKey(process.env.APPWRITE_API_KEY); 
  
const users = new Users(appwriteClient);
const db = new Databases(appwriteClient);

async function getAppwriteUserDoc(discordUsername)
{
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
		message = `You aren't registered. [Register](https://discord.com/oauth2/authorize?response_type=code&client_id=1373716555539550258&state=%7B"success"%3A"https%3A%5C%2F%5C%2F9000-firebase-preferenceapp-1747585836579.cluster-aj77uug3sjd4iut4ev6a4jbtf2.cloudworkstations.dev%5C%2F%5C%2F"%2C"failure"%3A"https%3A%5C%2F%5C%2F9000-firebase-preferenceapp-1747585836579.cluster-aj77uug3sjd4iut4ev6a4jbtf2.cloudworkstations.dev%5C%2Ffail"%2C"token"%3Afalse%7D&scope=identify+email&redirect_uri=https%3A%2F%2Ffra.cloud.appwrite.io%2Fv1%2Faccount%2Fsessions%2Foauth2%2Fcallback%2Fdiscord%2F682a090200212195fb22) to get started`;
		throw new Error(message);
	}
	    
	const theirUsername = options.getString('username');
	const theirAppwriteDoc = await getAppwriteUserDoc(theirUsername);
  console.log(theirAppwriteDoc);
	if(theirAppwriteDoc == null)
	{
		message = `${theirUsername} isn't registered`;
		throw new Error(message);
	}

	const myUser = user;
	const theirUser = await client.users.fetch(theirAppwriteDoc.discordUserId) || null;

	const doIAlreadyLikeThem = await db.listDocuments('db', 'likes', [ Query.equal('userA', [myUsername]), Query.equal('userB', theirUsername) ]);
	const doTheyAlreadyLikeMe = await db.listDocuments('db', 'likes', [ Query.equal('userA', [theirUsername]), Query.equal('userB', myUsername) ]);
	    
      	if (commandName === 'like')
      	{
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
				await user.send(`You matched with ${theirUsername}`);
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
					const subscriptionDate = new Date(theirSubscription.documents[0].timestamp);
					const currentDate = new Date();
					if (subscriptionDate > currentDate) 
					{
					  	await theirUser.send(`${myUsername} liked you`);
					}
					else
					{
            console.log(subscriptionDate);
            console.log(currentDate);
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
			console.log(error);
		}
      }
      else if(commandName === "unlike")
      {
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
	  console.log(error);
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
        expirationTimestamp = mySubscription.documents[0].timestamp;
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

      if (item === "0") {
        // 1 week = 7 days * 24 hours * 60 minutes * 60 seconds * 1000 milliseconds
        newTimestamp += 7 * 24 * 60 * 60 * 1000;
      } else if (item === "1") {
        // 1 month (approximate) = 30 days
        newTimestamp += 30 * 24 * 60 * 60 * 1000;
      } else if (item === "2") {
        // 6 months (approximate) = 6 * 30 days
        newTimestamp += 6 * 30 * 24 * 60 * 60 * 1000;
      } else if (item === "3") {
        // 1 year (approximate) = 365 days
        newTimestamp += 365 * 24 * 60 * 60 * 1000;
      }

      const createSubscription = await db.createDocument('db', 'subscriptions', ID.unique(), { username:registeredUser.discordUsername, timestamp:newTimestamp }, [ Permission.read(Role.user(userId)) ]);

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
