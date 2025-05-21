import { Client, Events, GatewayIntentBits, ActivityType } from 'discord.js';
import { Client as AppwriteClient, Users, Databases, Query } from 'node-appwrite';

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

async function handleInteraction(interaction) 
{
    let message = "";
    try
    {
    	if(!interaction.isCommand()) 
    	{
        	return;
    	}   

        const { commandName, user } = interaction;

        if (commandName === 'echo')
        {
            try
            {
                const otherUser = await client.users.fetch('243998465451884544');
	            await user.send(`You matched with ${otherUser.username}`);
            }
            catch(error)
            {
                console.log(error);
                message += `An error occurred when trying to send a direct message to you`;
            }

            try
            {
                const otherUser = await client.users.fetch('243998465451884544');
                await otherUser.send(`You matched with ${user.username}`);
            }
            catch(error)
            {
                console.log(error);
                if(message === "")
                {
                    message += `An error occurred when trying to a send a direct message to ${otherUser.username}`;
                }
                else
                {
                    message += `and an error occurred when trying to a send a direct message to ${otherUser.username}`
                }
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
            message = "Success";
        }
        await interaction.reply({
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
    console.error('❌ Stripe webhook signature verification failed.', err.message);
    return res.status(401).json({ success: false, error: 'Invalid Stripe signature' });
  }

  // Handle only checkout session completion
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const userId = session.metadata?.userId;

    if (!userId) {
      console.error('❌ Missing userId in Stripe session metadata.');
      return res.status(400).json({ success: false, error: 'Missing userId' });
    }
    console.log("Success");

     /*
    try {
      const apiKey = req.headers['x-appwrite-key'];
      const client = new AppwriteClient();

      client
        .setEndpoint(process.env.APPWRITE_FUNCTION_API_ENDPOINT)
        .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID)
        .setKey(apiKey);

      const users = new Users(client);
      const user = await users.get(userId);

      const updatedLabels = new Set(user.labels ?? []);
      updatedLabels.add('paid');

      await users.updateLabels(userId, [...updatedLabels]);

      console.log(`✅ Added "paid" label to user ${userId}`);
      return res.json({ success: true });
    } catch (err) {
      console.error('❌ Failed to update user labels:', err);
      return res.status(500).json({ success: false, error: 'Internal server error' });
    }
    */
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
