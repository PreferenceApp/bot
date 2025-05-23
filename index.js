/*import dotenv from 'dotenv';
dotenv.config();*/

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

      //see if we exist
      const selfRegistered = await db.listDocuments(
          'db',
          'discordUsers',
          [
            Query.equal('discordUsername', [user.username])
          ]
      )

      if(selfRegistered.documents.length === 0)
      {
        message = `Your account isn't registered. Click [here](https://discord.com/oauth2/authorize?response_type=code&client_id=1373716555539550258&state=%7B"success"%3A"https%3A%5C%2F%5C%2F9000-firebase-preferenceapp-1747585836579.cluster-aj77uug3sjd4iut4ev6a4jbtf2.cloudworkstations.dev%5C%2F%5C%2F"%2C"failure"%3A"https%3A%5C%2F%5C%2F9000-firebase-preferenceapp-1747585836579.cluster-aj77uug3sjd4iut4ev6a4jbtf2.cloudworkstations.dev%5C%2Ffail"%2C"token"%3Afalse%7D&scope=identify+email&redirect_uri=https%3A%2F%2Ffra.cloud.appwrite.io%2Fv1%2Faccount%2Fsessions%2Foauth2%2Fcallback%2Fdiscord%2F682a090200212195fb22) to get started`;
        throw new Error(message);
      }

      if (commandName === 'like')
      {
          try
          {
            const username = options.getString('username').toLowerCase();
            
            //see if user exists
            const otherRegistered = await db.listDocuments(
                'db',
                'discordUsers',
                [
                  Query.equal('discordUsername', [username])
                ]
            );

            if(otherRegistered.documents.length === 0)
            {
              //user doesn't exist
              message = `${username} isn't registered`;
              throw new Error(message);
            }

            const getDiscordUserInAppwrite = otherRegistered.documents[0];
            const otherDiscordUser = await client.users.fetch(getDiscordUserInAppwrite.discordUserId) || null;

            const doTheyLikeMe = await db.listDocuments(
              'db',
              'matches',
              [
                Query.equal('userA', [username]),
                Query.equal('userB', [user.username]),
              ]
            );

            if(doTheyLikeMe.documents.length === 0)
            {
              //They don't like me
              if(user.username === username)
              {
                message = "You can't like yourself";
                throw new Error(message);
              }
              const createMatchDoc = await db.createDocument(
                'db',
                'matches',
                ID.unique(),
                {
                  userA: user.username,
                  userB: username,
                  match: false
                },
                [
                  Permission.read(Role.user(selfRegistered.documents[0].$id))
                ]
              );

              if(otherDiscordUser)
              {
                if(user.labels)
                {
                  await otherDiscordUser.send(`You matched with ${user.username}`);
                }
                else
                {
                  await otherDiscordUser.send("Someone likes you");
                }
              }
            }
            else
            {
                //They like me, it's a match
                const createMyMatchDoc = await db.createDocument(
                'db',
                'matches',
                ID.unique(),
                {
                  userA: user.username,
                  userB: username,
                  match: true
                },
                [
                  Permission.read(Role.user(selfRegistered.documents[0].$id))
                ]
              );

              const updateTheirMatchDoc = await db.updateDocument(
                'db',
                'matches',
                doTheyLikeMe.documents[0].$id,
                {
                  userA: doTheyLikeMe.documents[0].userA,
                  userB: doTheyLikeMe.documents[0].userB,
                  match: true
                },
                [
                  Permission.read(Role.user(otherRegistered.documents[0].$id))
                ]
              
              );

              if(otherDiscordUser)
              {
                await otherDiscordUser.send(`You matched with ${user.username}`);
              }

              await user.send(`You matched with ${username}`);
            }
          }
          catch(error)
          {
              console.log(error);
          }
      }
      else if(commandName === "unlike")
      {
        try
        {
            const username = options.getString('username').toLowerCase();

            const checkIfILikeThem = await db.listDocuments(
              'db',
              'matches',
              [
                Query.equal('userA', [user.username]),
                Query.equal('userB', [username])
              ]
            );

            if(checkIfILikeThem.documents.length === 0)
            {
              message = `There's no record that you ever liked ${username}`;
              throw new Error(message);
            }

            const deleteMatch = await db.deleteDocument('db', 'matches', checkIfILikeThem.documents[0].$id);
            
            const checkIfTheyLikeMe = await db.listDocuments(
              'db',
              'matches',
              [
                Query.equal('userA', [username]),
                Query.equal('userB', [user.username])
              ]
            );

            if(checkIfTheyLikeMe.documents.length > 0)
            {
              if(checkIfTheyLikeMe.documents[0].match)
              {
                const removeMatch = await db.updateDocument('db', 'matches', checkIfTheyLikeMe.documents[0].$id, { userA: checkIfTheyLikeMe.documents[0].userA, userB: checkIfTheyLikeMe.documents[0].userB, match: false}, 
                [ 
                  Permission.read(Role.user(otherRegistered.documents[0].$id))
                ]);
              }
            }
        }
        catch(error)
        {
          console.log(error);
        }
      }
      else if(commandName === "matches")
      {
        try
        {
          const page = options.getInteger('page');
          const myMatches = await db.listDocuments(
          'db',
          'matches',
          [
            Query.equal('userA', [user.username]),
            Query.equal('match', true),
            Query.offset(page - 1),
            Query.limit(25)
          ]);

          if(myMatches.documents.length === 0)
          {
            message = "No matches found";
            throw new Error(message);
          }

          const matchesMapped = myMatches.documents.map(doc => `${doc.userB}`);
          message = matchesMapped.join('\n');
        }
        catch(error)
        {
          console.log(error);
        }
      }
      else if(commandName === "admirers")
      {
        try
        {

          //CHECK IF USER LABEL UNIX IS > DATE.NOW
          const page = options.getInteger('page');
          const myAdmirers = await db.listDocuments(
          'db',
          'matches',
          [
            Query.equal('userB', [user.username]),
            Query.equal('match', false),
            Query.offset(page - 1),
            Query.limit(25)
          ]);

          if(myAdmirers.documents.length === 0)
          {
            message = "No admirers found";
            throw new Error(message);
          }
          else
          {
            //if user has label and is valid
            const user = await users.get(selfRegistered.documents[0].discordUserId);

            if(user.labels.length === 0)
            {
              message = `${myAdmirers.total} people like you. [Find out](https://www.google.com) who it is`;
            }
            else
            {
                const expirationTimestamp = user.labels[0];
                const timestamp = Date.now();

                if(expirationTimestamp > timestamp)
                {
                  //valid
                  const admirersMapped = myAdmirers.documents.map(doc => `${doc.userA}`);
                  message = admirersMapped.join('\n');
                }
                else
                {
                  message = `${myAdmirers.total} people like you. [Find out](https://www.google.com) who it is`;
                }
            }
          }
        }
        catch(error)
        {
          console.log(error);
        }
      }
      else if(commandName === "crushes")
      {
        try
        {
          const page = options.getInteger('page');
          const myCrushes = await db.listDocuments(
          'db',
          'matches',
          [
            Query.equal('userA', [user.username]),
            Query.equal('match', false), 
            Query.offset(page - 1),
            Query.limit(25)
          ]);

          if(myCrushes.documents.length === 0)
          {
              message = "No crushes found";
              throw new Error(message);
          }
          const crushesMapped = myCrushes.documents.map(doc => `${doc.userB}`);
          message = crushesMapped.join('\n');
        }
        catch(error)
        {
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
            message = "Command executed successfully";
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
      const user = await users.get(userId);
      const timestamp = Date.now();

      let expirationTimestamp = 0;
      if(user.labels.length > 0)
      {
        expirationTimestamp = parseInt(user.labels[0]);
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


      await users.updateLabels(userId, [newTimestamp.toString()]);

      return res.json({ success: true });
    } catch (err) {
      console.error('Failed to update user labels:', err);
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
