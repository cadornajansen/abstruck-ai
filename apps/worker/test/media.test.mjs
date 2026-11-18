import assert from "node:assert/strict";
import { test } from "node:test";
import { transcriptOutput } from "../dist/media.js";

const url="https://synthetic.example/private-audio";
const transcript={status:"completed",audio_url:url,speech_model_used:"universal-2",audio_duration:22,language_code:"en",
  words:[{text:"Group",start:500,end:700},{text:"A",start:710,end:800},{text:"received",start:810,end:1100},
    {text:"200",start:1110,end:1500},{text:"mL.",start:1510,end:1900},{text:"Five",start:5000,end:5200},{text:"seedlings.",start:5210,end:5800}]};

test("transcript source sentences retain ordered millisecond citations and second units",()=>{
  const output=transcriptOutput(transcript,21744,url);
  assert.equal(output.providerSeconds,22);
  assert.equal(output.costUsd,0.0010388889);
  assert.deepEqual(output.segments.map(({text,locator})=>({text,locator})),[
    {text:"Group A received 200 mL.",locator:{type:"time",start_ms:500,end_ms:1900}},
    {text:"Five seedlings.",locator:{type:"time",start_ms:5000,end_ms:5800}},
  ]);
});

test("transcripts reject a different private source or invalid timestamps",()=>{
  assert.throws(()=>transcriptOutput(transcript,21744,"https://another.example/private-audio"),/transcript_validation_failed/);
  assert.throws(()=>transcriptOutput({...transcript,words:[{text:"Bad",start:100,end:50}]},21744,url),/transcript_timestamp_invalid/);
  assert.throws(()=>transcriptOutput({...transcript,words:[{text:"Late",start:50000,end:51000}]},21744,url),/transcript_timestamp_invalid/);
  assert.throws(()=>transcriptOutput({...transcript,words:[]},21744,url),/media_no_speech/);
});

test("chapters come only from valid provider sections; missing chapters stay unavailable",()=>{
  const section={start:500,end:5800,headline:"Actual provider headline",text:"Actual provider summary."};
  const output=transcriptOutput({...transcript,speech_understanding:{response:{summarization:{status:"success",summary:[section]}}}},21744,url);
  assert.deepEqual(output.chapters,[{startMs:500,endMs:5800,title:section.headline,summary:section.text}]);
  assert.equal(output.chaptersStatus,"ready");
  assert.equal(transcriptOutput(transcript,21744,url).chaptersStatus,"unavailable");
});
