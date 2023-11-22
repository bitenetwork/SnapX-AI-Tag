require('dotenv').config();
const express = require('express');
const expressSession = require('express-session')
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

exports.handler = async (event) => {
  
  const response = {
    statusCode: 200,
    headers: {
      "Access-Control-Allow-Headers" : "*",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "*"
    },
  };
  return response;
}
