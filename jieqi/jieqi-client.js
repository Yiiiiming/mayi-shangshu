/** Main-thread facade. No hidden deal, seed, or private AI history is stored here. */
export function createJieqiClient({onStatus=()=>{},workerFactory=url=>new Worker(url,{type:'module'})}={}) {
  let worker=null,starting=null,sequence=0,gameId=null,closed=false;
  const pending=new Map();
  const abortError=()=>new DOMException('分析已取消。','AbortError');
  function notifyStatus(value){onStatus(value);if(typeof window!=='undefined')window.dispatchEvent(new CustomEvent('engine-status',{detail:value}));}
  async function connect(){
    if(closed)throw new Error('揭棋连接已经关闭。');
    if(worker)return worker;if(starting)return starting;
    starting=(async()=>{
      if(globalThis.window?.engineEnvironmentReady)await window.engineEnvironmentReady;
      const instance=workerFactory(new URL('./referee-worker.js',import.meta.url));worker=instance;
      instance.addEventListener('message',event=>{
        const message=event.data||{};
        if(message.kind==='status'){notifyStatus(message.value);return;}
        const item=pending.get(message.id);if(!item)return;
        if(message.kind==='event'){item.onEvent?.(message.value);return;}
        pending.delete(message.id);item.signal?.removeEventListener('abort',item.onAbort);
        if(message.kind==='error'){item.reject(new Error(message.message||'揭棋操作失败。'));return;}
        if(message.kind!=='result'){item.reject(new Error('揭棋响应无效。'));return;}
        if(message.value?.gameId)gameId=message.value.gameId;
        if(item.onEvent&&message.value?.type)item.onEvent(message.value);
        item.resolve(message.value);
      });
      instance.addEventListener('error',()=>{
        const error=new Error('揭棋裁判或引擎加载失败，请刷新页面重新开始。');
        for(const item of pending.values()){item.signal?.removeEventListener('abort',item.onAbort);item.reject(error);}pending.clear();
        instance.terminate();worker=null;notifyStatus({phase:'error',message:error.message});
      });
      return instance;
    })();
    try{return await starting;}finally{starting=null;}
  }
  async function call(op,input={},onEvent,signal){
    if(signal?.aborted)throw abortError();
    const instance=await connect();if(signal?.aborted)throw abortError();
    const id=++sequence;
    return new Promise((resolve,reject)=>{
      const item={resolve,reject,onEvent,signal,onAbort:null};
      item.onAbort=()=>{
        if(!pending.has(id))return;pending.delete(id);signal?.removeEventListener('abort',item.onAbort);
        instance.postMessage({id:++sequence,op:'cancel',input:{targetId:id}});reject(abortError());
      };
      pending.set(id,item);signal?.addEventListener('abort',item.onAbort,{once:true});
      if(signal?.aborted){item.onAbort();return;}
      instance.postMessage({id,op,input:op==='create'||op==='ready'?input:{gameId,...input}});
    });
  }
  return {
    create:options=>call('create',options),
    ready:()=>call('ready'),
    state:()=>call('state'),
    move:(move,revision)=>call('move',{move,revision}),
    record:(move,observations,revision)=>call('record',{move,observations,revision}),
    undo:revision=>call('undo',{revision}),
    analyze:(options,onEvent,{signal}={})=>call('analyze',options,onEvent,signal),
    ai:(options,onEvent,{signal}={})=>call('ai',options,onEvent,signal),
    stop:()=>call('stop'),
    dispose(){closed=true;worker?.terminate();worker=null;for(const item of pending.values()){item.signal?.removeEventListener('abort',item.onAbort);item.reject(abortError());}pending.clear();}
  };
}
