import os from "os";

const samples=[];
const MAX=720;
let requestCount=0,errorCount=0,totalLatency=0;

export function metricsMiddleware(req,res,next){
  const start=process.hrtime.bigint();
  res.on("finish",()=>{
    const ms=Number(process.hrtime.bigint()-start)/1e6;
    requestCount+=1; totalLatency+=ms; if(res.statusCode>=400) errorCount+=1;
  });
  next();
}

function cpuPercent(){
  const cpus=Math.max(1,os.cpus().length); const load=os.loadavg()[0]||0; return Math.min(100,Math.max(0,(load/cpus)*100));
}
function memPercent(){const total=os.totalmem()||1;return Math.min(100,Math.max(0,((total-os.freemem())/total)*100));}
export function collectMetricSample(){
  const sample={at:new Date().toISOString(),cpu:Number(cpuPercent().toFixed(1)),memory:Number(memPercent().toFixed(1)),latency:Number((requestCount?totalLatency/requestCount:0).toFixed(1)),errors:errorCount,requests:requestCount};
  samples.push(sample);if(samples.length>MAX)samples.splice(0,samples.length-MAX);requestCount=0;errorCount=0;totalLatency=0;return sample;
}
export function getSystemMetrics(){
  if(!samples.length) collectMetricSample();
  const current=collectMetricSample();
  return {server:{cpuUsage:current.cpu,memoryUsage:current.memory,uptimeSec:Math.floor(process.uptime()),platform:`${os.type()} ${os.release()}`,hostname:os.hostname(),nodeVersion:process.version,cpuModel:os.cpus()?.[0]?.model||"Unknown",totalMemoryBytes:os.totalmem()},live:{latencyMs:current.latency,errorCount:current.errors,requestCount:current.requests},history:samples.slice(-60)};
}
