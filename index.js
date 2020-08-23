const Twitter = require('twitter-lite');
const queryString = require('query-string');
require('dotenv').config();

const DEBUG = true;
const MINUTES_BETWEEN_RUNS = 1;

const searchUrl = () => {
  let d = new Date();
  d.setMinutes(d.getMinutes() - MINUTES_BETWEEN_RUNS);
  const params = {
    query: '@threadrip unroll',
    'tweet.fields': 'conversation_id,author_id',
    'user.fields': 'username',
    expansions: 'author_id',
    start_time: d.toISOString(),
  };
  DEBUG && console.log('params', JSON.stringify(params, null, 2));
  const qs = queryString.stringify(params);
  return `tweets/search/recent?${qs}`;
};

const buildStatus = (tweet, usernameMap) => {
  const username = usernameMap[tweet.author_id];
  const url = `https://twitter.com/i/status/${tweet.conversation_id}`;
  return `@${username} 📜 the.rip?${url}`;
};

const run = async () => {
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
    const searchRes = await v2Client.get(searchUrl());
    DEBUG && console.log('searchRes', JSON.stringify(searchRes, null, 2));
    let usernameMap = {};
    if (searchRes.includes && searchRes.includes.users) {
      const userList = searchRes.includes.users;
      userList.forEach((u) => {
        usernameMap[u.id] = u.username;
      });
    }
    DEBUG && console.log('usernameMap', JSON.stringify(usernameMap, null, 2));
    const searchData = searchRes.data;
    if (searchData) {
      searchData.forEach((t) => {
        const reply = async () => {
          const status = buildStatus(t, usernameMap);
          try {
            const params = {
              status: status,
              in_reply_to_status_id: t.id,
            };
            DEBUG && console.log('postParams', JSON.stringify(params, null, 2));
            const replyRes = await v1Client.post('statuses/update.json', params);
            DEBUG && console.log('replyRes', JSON.stringify(replyRes, null, 2));
          } catch (e) {
            console.log(e);
          }
        };
        reply();
      });
    }
  } catch (e) {
    console.error(e);
  }
};

run();
