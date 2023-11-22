require('dotenv').config();
const bodyParser = require('body-parser');
const fetch = require('node-fetch');
const { RekognitionClient, DetectModerationLabelsCommand } = require("@aws-sdk/client-rekognition");
const ecsign = require('ethereumjs-util').ecsign;
const ethers_utils = require('ethers/lib/utils');
const keccak256 = ethers_utils.keccak256;
const defaultAbiCoder = ethers_utils.defaultAbiCoder;

const client = new RekognitionClient({
  // Detect moderation labels is available on AWS region us-east-1, us-west-2 and eu-west-1
  region: "ap-southeast-1",
  accessKeyId: process.env.aws_access_key_id,
  secretAccessKey: process.env.aws_secret_access_key
});

function hasItem(a, b) {
  for ( let i = 0 ; i < a.length ; i++)
    if ( a[i] == b ) {
      return true;
  }
  return false;
}

const detectProfanityTag = async (url) => {
  
  const bannedContent = ["Explicit Nudity", "Violence", "Visually Disturbing", "Drugs", "Hate Symbols"];
  let imageData;
  try{
    imageData = await fetch(url);
  } catch (error) {
    const response = {
      statusCode: 400,
      body: JSON.stringify('Fail to Fetch Images'),
    };
    return response;
  }
  const imageblob = await imageData.buffer();

  const params = {
    Image: {
      Bytes: imageblob
    },
    MinConfidence: 0.0
  }
  const command = new DetectModerationLabelsCommand(params);
  const data = await client.send(command);

  const moderationLabels = data.ModerationLabels;
  for ( let j = 0 ; j < moderationLabels.length ; j++ ) {
    if ( moderationLabels[j].Confidence > 80 ) {
      if ( hasItem(bannedContent, moderationLabels[j].Name)) {
        return true;
      }
    }
  }
  
  return false;
}

exports.handler = async (event, context, callback) => {

  console.log(event.body);
  const body = JSON.parse(event.body);
  const cid = body.cid;

  // get profile cid
  const url = process.env.ipfs_gateway + cid;
  // grab image cids
  let profileResponse;
  try{
    profileResponse = await fetch(url);
  } catch (error) {
    const response = {
      statusCode: 400,
      body: JSON.stringify('Fail to Fetch Profile'),
    };
    return response;
  }
  const data = await profileResponse.json();
  const imageCids = data.profilePictureCid;

  // detect profanity
  for ( let i = 0 ; i < imageCids.length ; i++ ){
    // Screen through AWS Rekonigtion
    const isRejected = await detectProfanityTag(process.env.ipfs_gateway + imageCids[i]);
    if (isRejected) {
      let message = 'Inappropriate Material: Detected one of the Tags: [Explicit Nudity, Violence, Visually Disturbing, Drugs, Hate Symbols]';
      const response = {
        statusCode: 400,
        body: JSON.stringify({message}),
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Headers" : "*",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "*"
        }
      };
      return response;
    }
  }

  // set deadline
  const deadline = Math.floor(new Date().getTime() / 1000) + 60*20;
  const dataHash = keccak256(defaultAbiCoder.encode(['string', 'string', 'bool', 'uint256'],["SET", cid, true, deadline]));

  // sign the data
  const { v, r, s } = ecsign(Buffer.from(dataHash.slice(2), 'hex'), Buffer.from(process.env.PRIVATE_KEY, 'hex'));

  const response = {
    statusCode: 200,
    headers: {
            "Access-Control-Allow-Headers" : "*",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "*"
        },
    body: JSON.stringify({
      permission: true,
      deadline: deadline,
      v: v,
      r: r,
      s: s
    }),
  };
  return response;


}
