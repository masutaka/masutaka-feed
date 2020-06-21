const twitter = require("twitter");

const twitter_client = new twitter({
  consumer_key: process.env.TWITTER_API_KEY,
  consumer_secret: process.env.TWITTER_API_SECRET_KEY,
  access_token_key: process.env.TWITTER_ACCESS_TOKEN,
  access_token_secret: process.env.TWITTER_ACCESS_TOKEN_SECRET,
});

exports.handler = (event, context, callback) => {
  twitter_client.post(
    "statuses/update",
    {
      status: "この 3 ヶ月でどれだけの炭酸水を飲んだだろう"
    },
    (error, tweet, response) => {
      if(error) {
        callback(null, "Twitter bot error.");
      }
      callback(null, "Twitter bot end.");
    }
  );
};
