const Twitter = require('twitter-lite');
const queryString = require('query-string');
require('dotenv').config();

let DEBUG = false;
if (process.env.NODE_ENV === 'production') {
  DEBUG = false;
}

const searchUrl = (sinceId) => {
  const params = {
    query: '@threadrip unroll',
    'tweet.fields': 'conversation_id,author_id',
    'user.fields': 'username',
    expansions: 'author_id',
  };
  if (sinceId) {
    params['since_id'] = `${sinceId}`;
  }
  DEBUG && console.log('params', JSON.stringify(params, null, 2));
  const qs = queryString.stringify(params);
  return `tweets/search/recent?${qs}`;
};

const buildStatus = (tweet, usernameMap) => {
  const username = usernameMap[tweet.author_id];
  const btoa = require('abab/lib/btoa');
  const encodedUrl = btoa(`https://twitter.com/i/status/${tweet.conversation_id}`);
  return `@${username} 🔗 the.rip/${encodedUrl}
‪👋 𝘐𝘧 𝘵𝘩𝘪𝘴 𝘪𝘴 𝘺𝘰𝘶𝘳 𝘧𝘪𝘳𝘴𝘵 𝘵𝘪𝘮𝘦 𝘶𝘴𝘪𝘯𝘨 𝘛𝘩𝘦.𝘙𝘪𝘱, 𝘺𝘰𝘶'𝘭𝘭 𝘩𝘢𝘷𝘦 𝘵𝘰 𝘴𝘪𝘨𝘯 𝘵𝘰 𝘶𝘯𝘳𝘰𝘭𝘭.
📅 𝘛𝘸𝘦𝘦𝘵𝘴 𝘰𝘭𝘥𝘦𝘳 𝘵𝘩𝘢𝘯 7 𝘥𝘢𝘺𝘴 𝘤𝘢𝘯'𝘵 𝘣𝘦 𝘶𝘯𝘳𝘰𝘭𝘭𝘦𝘥 𝘳𝘪𝘨𝘩𝘵 𝘯𝘰𝘸.‬`;
};

const run = async () => {
  console.log('starting run');
  let sinceId = null;
  const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
  try {
    const customer = await stripe.customers.retrieve(process.env.STRIPE_CUSTOMER_ID);
    sinceId = customer.metadata['since_id'];
  } catch (e) {
    console.error(e);
  }

  const userClient = new Twitter({
    consumer_key: process.env.TWITTER_ID,
    consumer_secret: process.env.TWITTER_SECRET,
  });
  const user = await userClient.getBearerToken();
  const v2Config = {
    subdomain: 'api',
    version: '2',
    bearer_token: user.access_token,
  };
  const v1Config = {
    subdomain: 'api',
    version: '1.1',
    consumer_key: process.env.TWITTER_ID,
    consumer_secret: process.env.TWITTER_SECRET,
    access_token_key: process.env.TWITTER_ACCESS_TOKEN,
    access_token_secret: process.env.TWITTER_ACCESS_TOKEN_SECRET,
  };
  DEBUG && console.log('v1Config', JSON.stringify(v1Config, null, 2));
  const v2Client = new Twitter(v2Config);
  const v1Client = new Twitter(v1Config);
  try {
    const searchRes = await v2Client.get(searchUrl(sinceId));
    console.log('search.meta:', searchRes.meta);
    DEBUG && console.log('searchRes', JSON.stringify(searchRes, null, 2));
    let usernameMap = {};
    if (searchRes.includes && searchRes.includes.users) {
      const userList = searchRes.includes.users;
      userList.forEach((u) => {
        usernameMap[u.id] = u.username;
      });
    }
    // DEBUG && console.log('usernameMap', JSON.stringify(usernameMap, null, 2));
    const searchData = searchRes.data;
    if (searchData && searchData.length > 0) {
      const updateSinceId = async (sinceId) => {
        if (sinceId && sinceId.length > 0 && sinceId !== 'null') {
          try {
            await stripe.customers.update(process.env.STRIPE_CUSTOMER_ID, {
              metadata: { since_id: sinceId },
            });
            console.log('updated since_id:', sinceId);
          } catch (e) {
            console.error('Error updating since_id: ', e);
          }
        } else {
          console.error('newSinceId is null');
        }
      };

      const reply = async (t) => {
        const status = buildStatus(t, usernameMap);
        const params = {
          status: status,
          in_reply_to_status_id: t.id,
        };
        try {
          if (!DEBUG) {
            const replyRes = await v1Client.post('statuses/update.json', params);
            console.log('replied to:', t.id);
            console.log('  reply id: ', replyRes.id);
          }
          newSinceId = t.id;
        } catch (e) {
          console.error('Error posting reply: ', e['errors']);
        }
      };

      const sortedData = searchData.sort((a, b) => parseInt(a.id) - parseInt(b.id));
      const latestTweet = sortedData[sortedData.length - 1];
      sortedData.forEach((t) => {
        reply(t);
      });
      updateSinceId(latestTweet.id);
    }
  } catch (e) {
    console.error(e);
  }
};

run();
