import { useState, useMemo, useEffect, useCallback } from "react";
import { supabase } from './supabase.js';

const PT = ['FB','2S','CT','SL','CB','CH','SP'];
const PC = { FB:'#f43f5e', '2S':'#f97316', CT:'#eab308', SL:'#22d3ee', CB:'#818cf8', CH:'#a78bfa', SP:'#34d399' };
const PL = { FB:'4-Seam', '2S':'2-Seam', CT:'Cutter', SL:'Slider', CB:'Curve', CH:'Change', SP:'Split' };
const W=220,H=265,ZL=64,ZR=156,ZT=60,ZB=180;
const ZW=ZR-ZL, ZH=ZB-ZT, CW=ZW/3, CR=ZH/3;
const getZone=(fx,fy)=>{const x=fx*W,y=fy*H;return(x>=ZL&&x<=ZR&&y>=ZT&&y<=ZB)?Math.floor((y-ZT)/CR)*3+Math.floor((x-ZL)/CW)+1:0};
const getComp=(fx,fy,m=14)=>{const x=fx*W,y=fy*H;return x>=ZL-m&&x<=ZR+m&&y>=ZT-m&&y<=ZB+m};
const uid=()=>Math.random().toString(36).slice(2,9);
const today=()=>new Date().toISOString().slice(0,10);
const fmtAvg=n=>(!isFinite(n)||isNaN(n))?'.---':n.toFixed(3).replace(/^0\./,'.');
const advCnt=(cnt,res)=>{let{b,s}={...cnt};if(res==='Ball')b=Math.min(b+1,4);else if(['StrikeL','StrikeS'].includes(res))s=Math.min(s+1,3);else if(res==='Foul'&&s<2)s++;return{b,s}};
const isTerm=(cnt,res)=>['InPlay','HBP'].includes(res)||(res==='Ball'&&cnt.b>=3)||(['StrikeL','StrikeS'].includes(res)&&cnt.s>=2);
const mkAB=(inn=1,lo=false)=>({id:uid(),inning:inn,leadoff:lo,risp:false,scored:false,fps:false,pitches:[],cnt:{b:0,s:0},result:null,hand:'R'});
const INIT_P={type:'FB',vel:'',fx:null,fy:null,result:null,hitType:null,hitStr:null,hitResult:null};
const RESULTS=[{k:'Ball',l:'Ball',c:'#3b82f6'},{k:'StrikeL',l:'Called K',c:'#ef4444'},{k:'StrikeS',l:'Swing K',c:'#ef4444'},{k:'Foul',l:'Foul',c:'#f59e0b'},{k:'InPlay',l:'In Play',c:'#22c55e'},{k:'HBP',l:'HBP',c:'#a78bfa'}];
const HT=[{k:'GB',l:'Grounder'},{k:'LD',l:'Line Drive'},{k:'FB',l:'Fly Ball'},{k:'PU',l:'Pop Up'}];
const HS=[{k:'Weak',l:'Weak'},{k:'Mod',l:'Moderate'},{k:'Hard',l:'Hard'}];
const HR_=[{k:'Out',l:'Out',c:'#64748b'},{k:'DP',l:'Dbl Play',c:'#f97316'},{k:'1B',l:'Single',c:'#22c55e'},{k:'2B',l:'Double',c:'#22c55e'},{k:'3B',l:'Triple',c:'#22c55e'},{k:'HR',l:'HR',c:'#ef4444'},{k:'E',l:'Error',c:'#f59e0b'}];
const COUNTS=['0-0','0-1','0-2','1-0','1-1','1-2','2-0','2-1','2-2','3-0','3-1','3-2'];

function computeStats(pitches,abs,runsByInning={}){
  if(!pitches.length)return null;
  const tp=pitches.length,bf=abs.length;
  const outs=abs.reduce((sum,ab)=>sum+(ab.result==='DP'?2:['Out','K','KL','FC','SF'].includes(ab.result)?1:0),0);
  const ipD=outs/3;
  const bbs=abs.filter(ab=>ab.result==='BB');
  const ks=abs.filter(ab=>['K','KL'].includes(ab.result));
  const hits=abs.filter(ab=>['1B','2B','3B','HR'].includes(ab.result));
  const hrs=abs.filter(ab=>ab.result==='HR');
  const innNums=[...new Set(pitches.map(p=>p.inning))];
  const innMap=Object.fromEntries(innNums.map(i=>[i,{ps:pitches.filter(p=>p.inning===i),abs:abs.filter(ab=>ab.inning===i)}]));
  const fps=abs.filter(ab=>ab.fps);
  const fpso=fps.filter(ab=>['Out','K','KL','FC','SF','DP'].includes(ab.result));
  const sub3=abs.filter(ab=>(ab.pitches?.length||0)<=3);
  const inn123=Object.values(innMap).filter(({abs:a})=>{
    const innOuts=a.reduce((sum,ab)=>sum+(ab.result==='DP'?2:['Out','K','KL'].includes(ab.result)?1:0),0);
    return innOuts>=3&&!a.some(ab=>['1B','2B','3B','HR','BB','HBP','E'].includes(ab.result));
  }).length;
  const sub13=Object.values(innMap).filter(({ps})=>ps.length<=13).length;
  const zeroWalk=Object.values(innMap).filter(({abs:a})=>!a.some(ab=>ab.result==='BB')).length;
  const lobb=bbs.filter(ab=>ab.leadoff).length;
  const bbsS=bbs.filter(ab=>ab.scored).length;
  const lobbS=bbs.filter(ab=>ab.leadoff&&ab.scored).length;
  const whiffs=pitches.filter(p=>p.result==='StrikeS');
  const inPlay=pitches.filter(p=>p.result==='InPlay');
  const gbP=inPlay.filter(p=>p.hitType==='GB');
  const fbP=inPlay.filter(p=>['FB','PU'].includes(p.hitType));
  const weakP=inPlay.filter(p=>p.hitStr==='Weak');
  const hhbP=inPlay.filter(p=>p.hitType==='LD'||(p.hitType==='GB'&&p.hitStr==='Hard'));
  const compP=pitches.filter(p=>p.comp);
  const abN=abs.filter(ab=>!['BB','HBP'].includes(ab.result)).length;
  const babipD=abN-ks.length-hrs.length;
  const babip=babipD>0?(hits.length-hrs.length)/babipD:0;
  const rispABs=abs.filter(ab=>ab.risp&&!['BB','HBP'].includes(ab.result));
  const rispH=rispABs.filter(ab=>['1B','2B','3B','HR'].includes(ab.result)).length;
  const baRisp=rispABs.length>0?rispH/rispABs.length:0;
  const ptBreak=Object.fromEntries(PT.map(t=>{const ps=pitches.filter(p=>p.type===t);const vps=ps.filter(p=>p.vel);return[t,{n:ps.length,pct:tp?Math.round(ps.length/tp*100):0,whiff:ps.filter(p=>p.result==='StrikeS').length,ball:ps.filter(p=>p.result==='Ball').length,avgVel:vps.length?Math.round(vps.reduce((s,p)=>s+p.vel,0)/vps.length):null}]}));
  const dps=abs.filter(ab=>ab.result==='DP').length;
  const countBk=Object.fromEntries(COUNTS.map(c=>{const[b,s]=c.split('-').map(Number);const a=abs.filter(ab=>(ab.pitches||[]).some(p=>p.cntBefore?.b===b&&p.cntBefore?.s===s));return[c,{n:a.length,outs:a.filter(ab=>['Out','K','KL','FC','DP'].includes(ab.result)).length,hits:a.filter(ab=>['1B','2B','3B','HR'].includes(ab.result)).length}]}));
  const totalRuns=Object.values(runsByInning).reduce((s,r)=>s+(r||0),0);
  const countPitchMix=Object.fromEntries(COUNTS.map(c=>{
    const[b,s2]=c.split('-').map(Number);
    const cps=pitches.filter(p=>p.cntBefore?.b===b&&p.cntBefore?.s===s2);
    const tot=cps.length;
    const byType=Object.fromEntries(PT.map(t=>{const n=cps.filter(p=>p.type===t).length;return[t,{n,pct:tot>0?Math.round(n/tot*100):0}]}));
    const nStrike=cps.filter(p=>['StrikeL','StrikeS','Foul'].includes(p.result)).length;
    const nBall=cps.filter(p=>p.result==='Ball').length;
    const nInPlay=cps.filter(p=>p.result==='InPlay').length;
    return[c,{total:tot,byType,strikePct:tot>0?Math.round(nStrike/tot*100):0,ballPct:tot>0?Math.round(nBall/tot*100):0,inPlayPct:tot>0?Math.round(nInPlay/tot*100):0,nStrike,nBall,nInPlay}];
  }));
  const mkSplit=(sAbs,sPs)=>{
    if(!sAbs.length)return null;
    const sOuts=sAbs.reduce((sum,ab)=>sum+(ab.result==='DP'?2:['Out','K','KL','FC','SF'].includes(ab.result)?1:0),0);
    const sHits=sAbs.filter(ab=>['1B','2B','3B','HR'].includes(ab.result));
    const sHrs=sAbs.filter(ab=>ab.result==='HR');
    const sKs=sAbs.filter(ab=>['K','KL'].includes(ab.result));
    const sBbs=sAbs.filter(ab=>ab.result==='BB');
    const sAbN=sAbs.filter(ab=>!['BB','HBP'].includes(ab.result)).length;
    const sBabipD=sAbN-sKs.length-sHrs.length;
    const sWhiffs=sPs.filter(p=>p.result==='StrikeS');
    const sFps=sAbs.filter(ab=>ab.fps);
    const sInPlay=sPs.filter(p=>p.result==='InPlay');
    const sGb=sInPlay.filter(p=>p.hitType==='GB');
    const sFbP=sInPlay.filter(p=>['FB','PU'].includes(p.hitType));
    const sComp=sPs.filter(p=>p.comp);
    const sVps=sPs.filter(p=>p.vel);
    const sPtBk=Object.fromEntries(PT.map(t=>{const ps=sPs.filter(p=>p.type===t);return[t,{n:ps.length,pct:sPs.length?Math.round(ps.length/sPs.length*100):0,whiff:ps.filter(p=>p.result==='StrikeS').length}]}));
    return{bf:sAbs.length,tp:sPs.length,ba:fmtAvg(sAbN>0?sHits.length/sAbN:0),babip:fmtAvg(sBabipD>0?(sHits.length-sHrs.length)/sBabipD:0),pbf:sAbs.length>0?(sPs.length/sAbs.length).toFixed(2):'—',kPct:sAbs.length>0?Math.round(sKs.length/sAbs.length*100)+'%':'—',bbPct:sAbs.length>0?Math.round(sBbs.length/sAbs.length*100)+'%':'—',whiffPct:sPs.length>0?Math.round(sWhiffs.length/sPs.length*100)+'%':'—',fpsPct:sAbs.length>0?Math.round(sFps.length/sAbs.length*100)+'%':'—',gbPct:sInPlay.length>0?Math.round(sGb.length/sInPlay.length*100)+'%':'—',fbPct:sInPlay.length>0?Math.round(sFbP.length/sInPlay.length*100)+'%':'—',compPct:sPs.length>0?Math.round(sComp.length/sPs.length*100)+'%':'—',avgVel:sVps.length?Math.round(sVps.reduce((s,p)=>s+p.vel,0)/sVps.length):null,ptBk:sPtBk};
  };
  const lSplit=mkSplit(abs.filter(ab=>ab.hand==='L'),pitches.filter(p=>p.hand==='L'));
  const rSplit=mkSplit(abs.filter(ab=>ab.hand==='R'),pitches.filter(p=>p.hand==='R'));
  return{ip:`${Math.floor(ipD)}.${outs%3}`,bf,tp,pip:ipD>0?(tp/ipD).toFixed(1):'—',pbf:bf>0?(tp/bf).toFixed(2):'—',sub3pct:bf>0?Math.round(sub3.length/bf*100)+'%':'—',inn123,sub13,fpsPct:bf>0?Math.round(fps.length/bf*100)+'%':'—',fpsoPct:fps.length>0?Math.round(fpso.length/fps.length*100)+'%':'—',compPct:tp>0?Math.round(compP.length/tp*100)+'%':'—',bbInn:ipD>0?(bbs.length/ipD).toFixed(2):'—',zeroWalk,lobb,bbsS,lobbS,whiffPct:tp>0?Math.round(whiffs.length/tp*100)+'%':'—',weakPct:inPlay.length>0?Math.round(weakP.length/inPlay.length*100)+'%':'—',hhbPct:inPlay.length>0?Math.round(hhbP.length/inPlay.length*100)+'%':'—',fbPct:inPlay.length>0?Math.round(fbP.length/inPlay.length*100)+'%':'—',gbPct:inPlay.length>0?Math.round(gbP.length/inPlay.length*100)+'%':'—',babip:fmtAvg(babip),baRisp:fmtAvg(baRisp),ptBreak,countBk,countPitchMix,walks:bbs.length,hits:hits.length,hrs:hrs.length,ks:ks.length,outs,dps,innCount:innNums.length,totalRuns,lSplit,rSplit};
}

function ZoneView({pitches=[],pending=null,onClickZone=null,filterType='all',hitsOnly=false}){
  const dots=useMemo(()=>{let d=filterType==='all'?pitches:pitches.filter(p=>p.type===filterType);if(hitsOnly)d=d.filter(p=>['1B','2B','3B','HR'].includes(p.hitResult));return d},[pitches,filterType,hitsOnly]);
  const handleClick=useCallback(e=>{if(!onClickZone)return;const r=e.currentTarget.getBoundingClientRect();onClickZone((e.clientX-r.left)/r.width,(e.clientY-r.top)/r.height)},[onClickZone]);
  return(
    <svg viewBox={`0 0 ${W} ${H}`} style={{width:'100%',maxWidth:220,height:'auto',cursor:onClickZone?'crosshair':'default',display:'block',margin:'0 auto'}} onClick={handleClick}>
      <defs><radialGradient id="zoneGrad" cx="50%" cy="50%" r="50%"><stop offset="0%" stopColor="#1e3a5f" stopOpacity="0.6"/><stop offset="100%" stopColor="#0f172a" stopOpacity="0"/></radialGradient></defs>
      <rect width={W} height={H} fill="#060d1a" rx="8"/>
      <rect width={W} height={H} fill="url(#zoneGrad)" rx="8"/>
      <rect x={ZL-16} y={ZT-16} width={ZW+32} height={ZH+32} fill="none" stroke="#1e3a5f" strokeWidth="1" strokeDasharray="4,3" rx="3" opacity="0.7"/>
      <rect x={ZL} y={ZT} width={ZW} height={ZH} fill="#0a1929" stroke="#2d6a9f" strokeWidth="2"/>
      {Array.from({length:9},(_,i)=>{const c=i%3,r=Math.floor(i/3);return <rect key={i} x={ZL+c*CW+0.5} y={ZT+r*CR+0.5} width={CW-1} height={CR-1} fill="#0d1f33" rx="1"/>})}
      {[1,2].map(i=><g key={i}><line x1={ZL+CW*i} y1={ZT} x2={ZL+CW*i} y2={ZB} stroke="#1a3550" strokeWidth="1"/><line x1={ZL} y1={ZT+CR*i} x2={ZR} y2={ZT+CR*i} stroke="#1a3550" strokeWidth="1"/></g>)}
      {Array.from({length:9},(_,i)=>{const c=i%3,r=Math.floor(i/3);return <text key={i} x={ZL+c*CW+CW/2} y={ZT+r*CR+CR/2+4} textAnchor="middle" fill="#1e3d60" fontSize="11" fontWeight="800" fontFamily="monospace">{i+1}</text>})}
      <polygon points={`${W/2-10},${H-20} ${W/2+10},${H-20} ${W/2+14},${H-12} ${W/2},${H-7} ${W/2-14},${H-12}`} fill="#0a1929" stroke="#2d6a9f" strokeWidth="1.5"/>
      <line x1={W/2} y1={ZB} x2={W/2} y2={H-20} stroke="#1a3550" strokeWidth="1" strokeDasharray="2,3"/>
      <text x="8" y="16" fill="#1a3550" fontSize="9" fontWeight="700" fontFamily="monospace">IB</text>
      <text x={W-22} y="16" fill="#1a3550" fontSize="9" fontWeight="700" fontFamily="monospace">OB</text>
      {dots.map((p,i)=>{const isHit=['1B','2B','3B','HR'].includes(p.hitResult);const isInPlay=p.result==='InPlay';return(<g key={i}>{isHit&&<circle cx={p.fx*W} cy={p.fy*H} r={9} fill={PC[p.type]} opacity="0.15"/>}<circle cx={p.fx*W} cy={p.fy*H} r={isHit?6.5:5} fill={PC[p.type]||'#94a3b8'} stroke={isHit?'#fff':isInPlay?'rgba(255,255,255,0.4)':'none'} strokeWidth={isHit?1.5:1} opacity="0.9"/></g>);})}
      {pending?.fx!=null&&(<g><circle cx={pending.fx*W} cy={pending.fy*H} r={12} fill={PC[pending.type]} opacity="0.12"/><circle cx={pending.fx*W} cy={pending.fy*H} r={8} fill={PC[pending.type]} stroke="#fff" strokeWidth="2" opacity="0.75"/><line x1={pending.fx*W-12} y1={pending.fy*H} x2={pending.fx*W+12} y2={pending.fy*H} stroke="#fff" strokeWidth="1" opacity="0.5"/><line x1={pending.fx*W} y1={pending.fy*H-12} x2={pending.fx*W} y2={pending.fy*H+12} stroke="#fff" strokeWidth="1" opacity="0.5"/></g>)}
    </svg>
  );
}

function BatterIcon({hand,selected,onClick,disabled}){
  const c=hand==='L'?'#3b82f6':'#fbbf24';
  const bg=hand==='L'?'rgba(59,130,246,0.14)':'rgba(251,191,36,0.14)';
  return(
    <div onClick={disabled?undefined:onClick} title={`${hand==='L'?'Left':'Right'}-handed batter`}
      style={{cursor:disabled?'default':'pointer',display:'flex',alignItems:'center',justifyContent:'center',borderRadius:'10px',border:`1.5px solid ${selected?c:`${c}40`}`,background:selected?bg:'transparent',transition:'all 0.2s',userSelect:'none',flexShrink:0,width:'40px',alignSelf:'stretch',filter:selected?`drop-shadow(0 0 6px ${c}70)`:'none',opacity:disabled&&!selected?0.45:1}}>
      <span style={{fontSize:'11px',fontWeight:'900',color:selected?c:`${c}80`,letterSpacing:'0.5px',transition:'color 0.2s',fontFamily:'monospace'}}>{hand}HH</span>
    </div>
  );
}

export default function App(){
  const [tab,setTab]=useState('chart');
  const [pitchers,setPitchers]=useState([]);
  const [outings,setOutings]=useState([]);
  const [newPName,setNewPName]=useState('');
  const [info,setInfo]=useState({pitcher:'',date:today(),opponent:''});
  const [active,setActive]=useState(false);
  const [oid,setOid]=useState(null);
  const [pitches,setPitches]=useState([]);
  const [atBats,setAtBats]=useState([]);
  const [inning,setInning]=useState(1);
  const [curAB,setCurAB]=useState(mkAB(1,true));
  const [pend,setPend]=useState({...INIT_P});
  const [inningRuns,setInningRuns]=useState({});
  const [ana,setAna]=useState({pitcher:'',outingId:'all',filterType:'all',hitsOnly:false,handFilter:'all'});
  const [session,setSession]=useState(null);
  const [authLoading,setAuthLoading]=useState(true);
  const [authEmail,setAuthEmail]=useState('');
  const [authPass,setAuthPass]=useState('');
  const [authErr,setAuthErr]=useState('');
  const [authMode,setAuthMode]=useState('signin');
  const [authDone,setAuthDone]=useState(false);

  useEffect(()=>{
    supabase.auth.getSession().then(({data:{session:s}})=>{setSession(s);setAuthLoading(false)});
    const{data:{subscription}}=supabase.auth.onAuthStateChange((_,s)=>setSession(s));
    return()=>subscription.unsubscribe();
  },[]);

  const handleLogin=async()=>{
    setAuthErr('');
    const{error}=await supabase.auth.signInWithPassword({email:authEmail,password:authPass});
    if(error)setAuthErr(error.message);
  };

  const handleSignUp=async()=>{
    setAuthErr('');
    const{error}=await supabase.auth.signUp({email:authEmail,password:authPass});
    if(error)setAuthErr(error.message);
    else setAuthDone(true);
  };

  useEffect(()=>{
    if(!session)return;
    supabase.from('pitchers').select('name').order('name').then(({data})=>{if(data?.length)setPitchers(data.map(p=>p.name))});
    supabase.from('outings').select('*').order('created_at',{ascending:false}).then(({data})=>{if(data)setOutings(data.map(o=>({id:o.id,pitcher:o.pitcher,date:o.date,opponent:o.opponent||'',pitches:o.pitches||[],atBats:o.at_bats||[],inningRuns:o.inning_runs||{},inning:o.inning||1})))});
    const ch=supabase.channel('pitchtrack-live')
      .on('postgres_changes',{event:'*',schema:'public',table:'outings'},payload=>{
        if(payload.eventType==='DELETE')return;
        const o=payload.new;
        setOutings(prev=>[...prev.filter(x=>x.id!==o.id),{id:o.id,pitcher:o.pitcher,date:o.date,opponent:o.opponent||'',pitches:o.pitches||[],atBats:o.at_bats||[],inningRuns:o.inning_runs||{},inning:o.inning||1}]);
      })
      .on('postgres_changes',{event:'INSERT',schema:'public',table:'pitchers'},payload=>{
        setPitchers(prev=>[...new Set([...prev,payload.new.name])].sort());
      })
      .subscribe();
    return()=>supabase.removeChannel(ch);
  },[session]);

  useEffect(()=>{
    if(!active||!oid||!session)return;
    const t=setTimeout(()=>{
      supabase.from('outings').upsert({id:oid,pitcher:info.pitcher,date:info.date,opponent:info.opponent||'',inning,pitches,at_bats:atBats,inning_runs:inningRuns,completed:false,updated_at:new Date().toISOString()}).then(()=>{});
    },400);
    return()=>clearTimeout(t);
  },[pitches,atBats,inningRuns,inning,active,oid,session]);

  const startOuting=()=>{if(!info.pitcher)return;const id=uid();setOid(id);setActive(true);setPitches([]);setAtBats([]);setInning(1);setInningRuns({});setCurAB(mkAB(1,true));setPend({...INIT_P})};

  const handleLogPitch=useCallback(()=>{
    if(!pend.fx||!pend.result)return;
    if(pend.result==='InPlay'&&(!pend.hitType||!pend.hitResult))return;
    const zone=getZone(pend.fx,pend.fy),comp=getComp(pend.fx,pend.fy);
    const pitch={id:uid(),type:pend.type,vel:pend.vel?parseFloat(pend.vel):null,fx:pend.fx,fy:pend.fy,zone,comp,result:pend.result,hitType:pend.hitType,hitStr:pend.hitStr,hitResult:pend.hitResult,inning,cntBefore:{...curAB.cnt},pitchNumAB:curAB.pitches.length+1,hand:curAB.hand};
    const newCnt=advCnt(curAB.cnt,pend.result);
    const term=isTerm(curAB.cnt,pend.result);
    const abPitches=[...curAB.pitches,pitch];
    let abRes=null;
    if(term){if(pend.result==='InPlay')abRes=pend.hitResult||'Out';else if(pend.result==='HBP')abRes='HBP';else if(newCnt.b>=4)abRes='BB';else if(newCnt.s>=3)abRes=pend.result==='StrikeL'?'KL':'K'}
    const newP=[...pitches,pitch];
    if(term&&abRes){
      const cAB={...curAB,pitches:abPitches,result:abRes,fps:!!(abPitches[0]&&(abPitches[0].zone>0||['StrikeL','StrikeS','Foul'].includes(abPitches[0].result)))};
      setAtBats(prev=>[...prev,cAB]);setPitches(newP);setCurAB(mkAB(inning,false));
    }else{setPitches(newP);setCurAB(prev=>({...prev,pitches:abPitches,cnt:newCnt}))}
    setPend({...INIT_P});
  },[pend,pitches,atBats,curAB,inning]);

  const handleUndo=()=>{if(!curAB.pitches.length)return;const np=curAB.pitches.slice(0,-1);const nc=np.reduce((c,p)=>advCnt(c,p.result),{b:0,s:0});setCurAB(prev=>({...prev,pitches:np,cnt:nc}));setPitches(prev=>prev.slice(0,-1))};
  const handleNewInning=()=>{const n=inning+1;setInning(n);setCurAB(mkAB(n,true))};
  const handleEndOuting=()=>{
    const saved={id:oid,pitcher:info.pitcher,date:info.date,opponent:info.opponent||'',pitches,atBats,inning,inningRuns};
    setOutings(prev=>[...prev.filter(o=>o.id!==oid),saved]);
    if(session)supabase.from('outings').upsert({id:oid,pitcher:info.pitcher,date:info.date,opponent:info.opponent||'',inning,pitches,at_bats:atBats,inning_runs:inningRuns,completed:true,updated_at:new Date().toISOString()}).then(()=>{});
    setActive(false);setOid(null);setPitches([]);setAtBats([]);setInning(1);setInningRuns({});setCurAB(mkAB(1,true));setPend({...INIT_P});
  };
  const addPitcher=()=>{if(!newPName.trim())return;const name=newPName.trim();setPitchers(prev=>[...new Set([...prev,name])].sort());setNewPName('');if(session)supabase.from('pitchers').upsert({name}).then(()=>{})};
  const curStats=useMemo(()=>computeStats(pitches,atBats,inningRuns),[pitches,atBats,inningRuns]);
  const anaData=useMemo(()=>{if(!ana.pitcher)return{pitches:[],atBats:[],stats:null,outings:[]};const fo=outings.filter(o=>o.pitcher===ana.pitcher&&(ana.outingId==='all'||o.id===ana.outingId));let ps=fo.flatMap(o=>o.pitches);let as=fo.flatMap(o=>o.atBats);const aggRuns=fo.reduce((acc,o)=>{Object.entries(o.inningRuns||{}).forEach(([inn,r])=>{acc[inn]=(acc[inn]||0)+r});return acc},{});const filtPs=ana.handFilter==='all'?ps:ps.filter(p=>p.hand===ana.handFilter);const filtAs=ana.handFilter==='all'?as:as.filter(ab=>ab.hand===ana.handFilter);return{pitches:ps,atBats:as,filtPitches:filtPs,filtAtBats:filtAs,stats:computeStats(ps,as,aggRuns),filtStats:computeStats(filtPs,filtAs),outings:fo}},[outings,ana]);

  const card=(x={})=>({background:'linear-gradient(135deg,#111827 0%,#0f172a 100%)',borderRadius:'10px',border:'1px solid #1e3a5f',padding:'14px',...x});
  const inp={background:'#060d1a',border:'1px solid #1e3a5f',borderRadius:'6px',padding:'7px 10px',color:'#e2e8f0',fontSize:'13px',outline:'none',boxSizing:'border-box',fontFamily:'inherit'};
  const lbl={fontSize:'9px',fontWeight:'800',color:'#475569',textTransform:'uppercase',letterSpacing:'1px',marginBottom:'5px',display:'block'};
  const StatBox=({v,l,accent})=>(<div style={{textAlign:'center',padding:'10px 6px',background:'#060d1a',borderRadius:'8px',border:'1px solid #1e3a5f'}}><div style={{fontSize:'18px',fontWeight:'900',color:accent||'#e2e8f0',lineHeight:1,fontFamily:'monospace',letterSpacing:'-1px'}}>{v||'—'}</div><div style={{fontSize:'9px',color:'#475569',marginTop:'3px',fontWeight:'700',textTransform:'uppercase',letterSpacing:'0.8px'}}>{l}</div></div>);
  const tog=(v,cur,c='#3b82f6')=>({padding:'5px 11px',borderRadius:'5px',border:`1.5px solid ${c}`,cursor:'pointer',fontSize:'11px',fontWeight:'800',background:cur===v?c:'transparent',color:cur===v?'#fff':c,transition:'all 0.12s',fontFamily:'inherit'});
  const resultColor=(r)=>{if(!r)return'#475569';if(['1B','2B','3B','HR'].includes(r))return'#22c55e';if(r==='BB')return'#f59e0b';if(['K','KL'].includes(r))return'#ef4444';if(r==='HBP')return'#a78bfa';if(r==='DP')return'#f97316';return'#64748b'};

  if(authLoading)return(<div style={{background:'#030712',minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center'}}><div style={{color:'#475569',fontSize:'14px',fontFamily:'monospace'}}>Loading...</div></div>);

  if(!session)return(
    <div style={{background:'#030712',minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'system-ui,sans-serif',padding:'20px'}}>
      <div style={{background:'#0f172a',border:'1px solid #1e3a5f',borderRadius:'14px',padding:'40px 36px',width:'100%',maxWidth:'360px',textAlign:'center',boxShadow:'0 25px 60px rgba(0,0,0,0.6)'}}>
        <div style={{fontSize:'42px',marginBottom:'10px'}}>⚾</div>
        <div style={{fontSize:'22px',fontWeight:'800',color:'#f1f5f9',marginBottom:'20px',letterSpacing:'-0.5px'}}>PitchTrack Pro</div>
        <div style={{display:'flex',gap:'4px',marginBottom:'24px',background:'#060d1a',borderRadius:'8px',padding:'4px'}}>
          {[{k:'signin',l:'Sign In'},{k:'signup',l:'Create Account'}].map(({k,l})=>(
            <button key={k} onClick={()=>{setAuthMode(k);setAuthErr('');setAuthDone(false);}} style={{flex:1,padding:'7px',borderRadius:'6px',border:'none',cursor:'pointer',fontWeight:'700',fontSize:'12px',background:authMode===k?'#1e3a5f':'transparent',color:authMode===k?'#60a5fa':'#475569',transition:'all 0.15s'}}>{l}</button>
          ))}
        </div>
        {authDone?(
          <div style={{background:'rgba(34,197,94,0.1)',border:'1px solid rgba(34,197,94,0.25)',borderRadius:'8px',padding:'16px',fontSize:'13px',color:'#4ade80'}}>
            ✓ Account created! You can now sign in.
          </div>
        ):(
          <>
            {authErr&&<div style={{background:'rgba(239,68,68,0.1)',border:'1px solid rgba(239,68,68,0.25)',borderRadius:'6px',padding:'9px 12px',fontSize:'12px',color:'#f87171',marginBottom:'16px',textAlign:'left'}}>{authErr}</div>}
            <input type="email" placeholder="Email address" value={authEmail} onChange={e=>setAuthEmail(e.target.value)} style={{width:'100%',padding:'11px 12px',borderRadius:'7px',border:'1px solid #1e3a5f',background:'#060d1a',color:'#f1f5f9',fontSize:'14px',marginBottom:'10px',boxSizing:'border-box',outline:'none',display:'block'}}/>
            <input type="password" placeholder="Password" value={authPass} onChange={e=>setAuthPass(e.target.value)} onKeyDown={e=>e.key==='Enter'&&(authMode==='signin'?handleLogin():handleSignUp())} style={{width:'100%',padding:'11px 12px',borderRadius:'7px',border:'1px solid #1e3a5f',background:'#060d1a',color:'#f1f5f9',fontSize:'14px',marginBottom:'18px',boxSizing:'border-box',outline:'none',display:'block'}}/>
            {authMode==='signin'
              ?<button onClick={handleLogin} style={{width:'100%',padding:'12px',borderRadius:'8px',border:'none',cursor:'pointer',fontWeight:'800',fontSize:'14px',background:'#3b82f6',color:'#fff',letterSpacing:'0.3px'}}>Sign In</button>
              :<button onClick={handleSignUp} style={{width:'100%',padding:'12px',borderRadius:'8px',border:'none',cursor:'pointer',fontWeight:'800',fontSize:'14px',background:'#22c55e',color:'#fff',letterSpacing:'0.3px'}}>Create Account</button>
            }
          </>
        )}
      </div>
    </div>
  );

  return(
    <div style={{fontFamily:'"DM Mono","IBM Plex Mono","Fira Code",monospace',background:'#030712',minHeight:'100vh',color:'#e2e8f0'}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=Space+Grotesk:wght@400;500;600;700;800&display=swap');
        *{box-sizing:border-box;}
        select option{background:#060d1a;}
        ::-webkit-scrollbar{width:4px;height:4px;}
        ::-webkit-scrollbar-track{background:#030712;}
        ::-webkit-scrollbar-thumb{background:#1e3a5f;border-radius:2px;}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.5}}
        .live-badge{animation:pulse 2s infinite;}
        .log-btn:hover:not(:disabled){background:#2563eb!important;transform:translateY(-1px);box-shadow:0 4px 20px rgba(59,130,246,0.4);}
        .log-btn:disabled{cursor:not-allowed;}
        .tab-btn:hover{color:#94a3b8!important;}
        input:focus,select:focus{border-color:#2d6a9f!important;box-shadow:0 0 0 2px rgba(45,106,159,0.2);}
      `}</style>

      <div style={{background:'#060d1a',borderBottom:'1px solid #1e3a5f',padding:'0 20px',display:'flex',alignItems:'center',height:'48px',position:'sticky',top:0,zIndex:100}}>
        <div style={{display:'flex',alignItems:'center',gap:'10px'}}>
          <span style={{fontSize:'16px',fontWeight:'800',letterSpacing:'-0.5px',color:'#e2e8f0',fontFamily:'"Space Grotesk",sans-serif'}}>⚾ PitchTrack</span>
          <span style={{fontSize:'10px',color:'#2d6a9f',fontWeight:'700',letterSpacing:'2px',textTransform:'uppercase',fontFamily:'"Space Grotesk",sans-serif'}}>PRO</span>
          {active&&<span className="live-badge" style={{fontSize:'10px',color:'#22c55e',fontWeight:'700',padding:'2px 7px',background:'rgba(34,197,94,0.08)',border:'1px solid rgba(34,197,94,0.2)',borderRadius:'3px',letterSpacing:'1px'}}>● LIVE</span>}
        </div>
        <nav style={{marginLeft:'auto',display:'flex',gap:'4px',alignItems:'center'}}>
          {[{k:'chart',l:'📋 CHARTING'},{k:'analytics',l:'📊 ANALYTICS'}].map(({k,l})=>(
            <button key={k} className="tab-btn" onClick={()=>setTab(k)} style={{padding:'6px 14px',borderRadius:'5px',border:'none',cursor:'pointer',fontWeight:'700',fontSize:'11px',background:tab===k?'#1e3a5f':'transparent',color:tab===k?'#60a5fa':'#475569',letterSpacing:'0.5px',transition:'all 0.15s',fontFamily:'inherit'}}>{l}</button>
          ))}
          <div style={{width:'1px',height:'20px',background:'#1e3a5f',margin:'0 4px'}}/>
          <button onClick={()=>supabase.auth.signOut()} style={{padding:'5px 10px',borderRadius:'5px',border:'1px solid #1e3a5f',cursor:'pointer',fontWeight:'600',fontSize:'10px',background:'transparent',color:'#475569',fontFamily:'inherit',letterSpacing:'0.5px'}}>Sign Out</button>
        </nav>
      </div>

      {tab==='chart'&&(
        <div style={{padding:'14px 16px',maxWidth:'1320px',margin:'0 auto'}}>
          <div style={{...card({padding:'12px 16px',marginBottom:'14px',display:'flex',flexWrap:'wrap',gap:'10px',alignItems:'flex-end'})}}>
            <div style={{flex:'0 0 auto'}}>
              <span style={lbl}>Pitcher</span>
              <select value={info.pitcher} onChange={e=>setInfo(p=>({...p,pitcher:e.target.value}))} style={{...inp,minWidth:'160px'}} disabled={active}>
                <option value="">— Select —</option>
                {pitchers.map(p=><option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div style={{flex:'0 0 auto'}}><span style={lbl}>Date</span><input type="date" value={info.date} onChange={e=>setInfo(p=>({...p,date:e.target.value}))} style={{...inp,width:'140px'}} disabled={active}/></div>
            <div style={{flex:'0 0 auto'}}><span style={lbl}>Opponent</span><input value={info.opponent} onChange={e=>setInfo(p=>({...p,opponent:e.target.value}))} style={{...inp,width:'110px'}} placeholder="vs. Team" disabled={active}/></div>
            <div style={{display:'flex',gap:'8px',flex:'0 0 auto'}}>
              {!active?<button onClick={startOuting} disabled={!info.pitcher} style={{padding:'8px 20px',borderRadius:'7px',border:'none',cursor:'pointer',fontWeight:'800',fontSize:'12px',background:info.pitcher?'rgba(34,197,94,0.9)':'#0f172a',color:'#fff',letterSpacing:'0.5px',transition:'all 0.15s',fontFamily:'inherit',opacity:info.pitcher?1:0.4}}>▶ START OUTING</button>
              :<button onClick={handleEndOuting} style={{padding:'8px 20px',borderRadius:'7px',border:'none',cursor:'pointer',fontWeight:'800',fontSize:'12px',background:'rgba(239,68,68,0.85)',color:'#fff',letterSpacing:'0.5px',fontFamily:'inherit'}}>■ END OUTING</button>}
            </div>
            <div style={{marginLeft:'auto',display:'flex',gap:'6px',alignItems:'flex-end',flex:'0 0 auto'}}>
              <div><span style={lbl}>Add Pitcher</span><input value={newPName} onChange={e=>setNewPName(e.target.value)} onKeyDown={e=>e.key==='Enter'&&addPitcher()} placeholder="Last, F." style={{...inp,width:'120px'}}/></div>
              <button onClick={addPitcher} style={{padding:'8px 12px',borderRadius:'6px',border:'1px solid #1e3a5f',cursor:'pointer',fontWeight:'800',background:'transparent',color:'#60a5fa',fontSize:'16px',lineHeight:1,transition:'all 0.15s',fontFamily:'inherit'}}>+</button>
            </div>
          </div>

          <div style={{display:'grid',gridTemplateColumns:'248px 1fr 290px',gap:'14px',alignItems:'start'}}>
            <div>
              <div style={{...card({padding:'12px'})}}>
                <div style={{fontSize:'9px',fontWeight:'800',color:'#2d6a9f',textAlign:'center',marginBottom:'8px',textTransform:'uppercase',letterSpacing:'2px'}}>{active?'TAP TO PLACE PITCH':'ZONE VIEW'}</div>
                <div style={{display:'flex',alignItems:'center',gap:'4px'}}>
                  <BatterIcon hand="R" selected={curAB.hand==='R'} onClick={()=>setCurAB(p=>({...p,hand:'R'}))} disabled={!active}/>
                  <div style={{flex:1,minWidth:0}}><ZoneView pitches={pitches} pending={active?pend:null} onClickZone={active?(fx,fy)=>setPend(p=>({...p,fx,fy})):null}/></div>
                  <BatterIcon hand="L" selected={curAB.hand==='L'} onClick={()=>setCurAB(p=>({...p,hand:'L'}))} disabled={!active}/>
                </div>
                <div style={{display:'flex',justifyContent:'center',alignItems:'center',gap:'12px',marginTop:'12px',padding:'10px',background:'#060d1a',borderRadius:'8px',border:'1px solid #1e3a5f'}}>
                  <div style={{textAlign:'center'}}><div style={{fontSize:'36px',fontWeight:'900',color:'#60a5fa',lineHeight:1,fontFamily:'monospace'}}>{curAB.cnt.b}</div><div style={{fontSize:'8px',color:'#2d6a9f',fontWeight:'800',letterSpacing:'1px'}}>BALLS</div></div>
                  <div style={{color:'#1e3a5f',fontSize:'24px',fontWeight:'900'}}>—</div>
                  <div style={{textAlign:'center'}}><div style={{fontSize:'36px',fontWeight:'900',color:'#f43f5e',lineHeight:1,fontFamily:'monospace'}}>{curAB.cnt.s}</div><div style={{fontSize:'8px',color:'#7f1d2e',fontWeight:'800',letterSpacing:'1px'}}>STRIKES</div></div>
                </div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:'4px',marginTop:'8px',fontSize:'10px',color:'#475569',textAlign:'center'}}>
                  <div>INN <span style={{color:'#e2e8f0',fontWeight:'700'}}>{inning}</span></div>
                  <div>PITCH <span style={{color:'#e2e8f0',fontWeight:'700'}}>#{pitches.length+1}</span></div>
                  <div>AB-P <span style={{color:'#e2e8f0',fontWeight:'700'}}>{curAB.pitches.length+1}</span></div>
                </div>
              </div>

              {curStats&&(
                <div style={{...card({padding:'10px',marginTop:'10px'})}}>
                  <div style={{fontSize:'9px',fontWeight:'800',color:'#2d6a9f',textTransform:'uppercase',letterSpacing:'1.5px',marginBottom:'8px'}}>Live Stats</div>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:'6px',marginBottom:'8px'}}>
                    <StatBox v={curStats.tp} l="Pitches"/>
                    <StatBox v={curStats.ip} l="IP"/>
                    <StatBox v={curStats.walks} l="Walks" accent="#f59e0b"/>
                    <StatBox v={curStats.ks} l="K's" accent="#ef4444"/>
                    <StatBox v={curStats.totalRuns} l="Runs" accent="#f43f5e"/>
                  </div>
                  <div style={{borderTop:'1px solid #1e3a5f',paddingTop:'8px'}}>
                    <div style={{fontSize:'9px',fontWeight:'800',color:'#475569',textTransform:'uppercase',letterSpacing:'1px',marginBottom:'6px'}}>Runs Scored — Inn {inning}</div>
                    <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
                      <button onClick={()=>setInningRuns(prev=>({...prev,[inning]:Math.max(0,(prev[inning]||0)-1)}))} disabled={!active} style={{width:'26px',height:'26px',borderRadius:'5px',border:'1px solid #1e3a5f',background:'transparent',color:'#64748b',cursor:'pointer',fontSize:'16px',lineHeight:1,display:'flex',alignItems:'center',justifyContent:'center',fontWeight:'900'}}>−</button>
                      <div style={{flex:1,textAlign:'center',fontSize:'22px',fontWeight:'900',color:'#f43f5e',fontFamily:'monospace'}}>{inningRuns[inning]||0}</div>
                      <button onClick={()=>setInningRuns(prev=>({...prev,[inning]:(prev[inning]||0)+1}))} disabled={!active} style={{width:'26px',height:'26px',borderRadius:'5px',border:'1px solid #f43f5e',background:'rgba(244,63,94,0.08)',color:'#f43f5e',cursor:'pointer',fontSize:'16px',lineHeight:1,display:'flex',alignItems:'center',justifyContent:'center',fontWeight:'900'}}>+</button>
                    </div>
                    {Object.keys(inningRuns).filter(i=>inningRuns[i]>0).length>0&&(
                      <div style={{display:'flex',flexWrap:'wrap',gap:'4px',marginTop:'6px'}}>
                        {Object.entries(inningRuns).filter(([,r])=>r>0).map(([i,r])=>(<span key={i} style={{fontSize:'9px',fontWeight:'700',color:'#94a3b8',background:'#0a1929',padding:'2px 5px',borderRadius:'3px'}}>I{i}: {r}R</span>))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {atBats.filter(ab=>ab.result==='BB').length>0&&(
                <div style={{...card({padding:'10px',marginTop:'10px'})}}>
                  <div style={{fontSize:'9px',fontWeight:'800',color:'#2d6a9f',textTransform:'uppercase',letterSpacing:'1.5px',marginBottom:'8px'}}>Walk Tracker</div>
                  {atBats.filter(ab=>ab.result==='BB').map((ab,i)=>(
                    <div key={i} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'4px 0',borderBottom:'1px solid #0f172a',fontSize:'11px'}}>
                      <span style={{color:'#64748b'}}>Inn {ab.inning} • BB {ab.leadoff?<span style={{color:'#f59e0b'}}>(Leadoff)</span>:null}</span>
                      <label style={{display:'flex',alignItems:'center',gap:'4px',cursor:'pointer',color:'#94a3b8'}}>
                        <input type="checkbox" checked={!!ab.scored} onChange={e=>{setAtBats(prev=>prev.map(a=>a.id===ab.id?{...a,scored:e.target.checked}:a))}} style={{accentColor:'#f43f5e',width:'12px',height:'12px'}}/>
                        <span style={{fontSize:'10px'}}>Scored</span>
                      </label>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={card()}>
              <div style={{fontWeight:'800',fontSize:'11px',color:'#2d6a9f',textTransform:'uppercase',letterSpacing:'2px',marginBottom:'16px',fontFamily:'"Space Grotesk",sans-serif'}}>Pitch Entry</div>
              <div style={{marginBottom:'14px'}}>
                <span style={lbl}>Pitch Type</span>
                <div style={{display:'flex',flexWrap:'wrap',gap:'5px'}}>
                  {PT.map(t=>(<button key={t} onClick={()=>setPend(p=>({...p,type:t}))} style={{...tog(t,pend.type,PC[t]),minWidth:'42px'}}>{t}</button>))}
                </div>
                <div style={{fontSize:'10px',color:'#475569',marginTop:'4px',fontWeight:'700'}}>{PL[pend.type]}</div>
              </div>
              <div style={{marginBottom:'14px'}}>
                <span style={lbl}>Velocity (mph)</span>
                <input type="number" min="40" max="108" value={pend.vel} onChange={e=>setPend(p=>({...p,vel:e.target.value}))} placeholder="e.g. 94" style={{...inp,width:'90px'}}/>
              </div>
              <div style={{marginBottom:'14px',padding:'8px 10px',background:'#060d1a',borderRadius:'6px',border:'1px solid #1e3a5f'}}>
                <span style={lbl}>Placement</span>
                {pend.fx?(
                  <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
                    <span style={{fontSize:'13px',fontWeight:'800',color:'#e2e8f0'}}>Zone {getZone(pend.fx,pend.fy)||<span style={{color:'#60a5fa'}}>Ball</span>}</span>
                    {getComp(pend.fx,pend.fy)&&<span style={{fontSize:'9px',color:'#f59e0b',background:'rgba(245,158,11,0.1)',border:'1px solid rgba(245,158,11,0.2)',padding:'2px 5px',borderRadius:'3px',fontWeight:'800',letterSpacing:'0.5px'}}>COMP</span>}
                    <button onClick={()=>setPend(p=>({...p,fx:null,fy:null}))} style={{marginLeft:'auto',background:'transparent',border:'none',cursor:'pointer',color:'#475569',fontSize:'14px',lineHeight:1}}>×</button>
                  </div>
                ):<span style={{fontSize:'12px',color:'#334155',fontStyle:'italic'}}>← Click on the zone to place</span>}
              </div>
              <div style={{marginBottom:'14px'}}>
                <span style={lbl}>Result</span>
                <div style={{display:'flex',flexWrap:'wrap',gap:'5px'}}>
                  {RESULTS.map(({k,l,c})=>(<button key={k} onClick={()=>setPend(p=>({...p,result:k}))} style={{...tog(k,pend.result,c),padding:'6px 12px'}}>{l}</button>))}
                </div>
              </div>
              {pend.result==='InPlay'&&(
                <div style={{background:'#060d1a',borderRadius:'8px',padding:'12px',marginBottom:'14px',border:'1px solid #1e3a5f'}}>
                  <div style={{fontWeight:'800',fontSize:'10px',color:'#2d6a9f',textTransform:'uppercase',letterSpacing:'1.5px',marginBottom:'10px'}}>In-Play Details</div>
                  <div style={{marginBottom:'10px'}}>
                    <span style={lbl}>Hit Type</span>
                    <div style={{display:'flex',gap:'4px',flexWrap:'wrap'}}>
                      {HT.map(({k,l})=><button key={k} onClick={()=>setPend(p=>({...p,hitType:k}))} style={{...tog(k,pend.hitType,'#475569'),padding:'5px 10px'}}>{l}</button>)}
                    </div>
                  </div>
                  <div style={{marginBottom:'10px'}}>
                    <span style={lbl}>Strength</span>
                    <div style={{display:'flex',gap:'4px'}}>
                      {HS.map(({k,l})=>{const sc=k==='Weak'?'#22c55e':k==='Hard'?'#ef4444':'#f59e0b';return <button key={k} onClick={()=>setPend(p=>({...p,hitStr:k}))} style={{...tog(k,pend.hitStr,sc),padding:'5px 11px'}}>{l}</button>})}
                    </div>
                  </div>
                  <div>
                    <span style={lbl}>Outcome</span>
                    <div style={{display:'flex',gap:'4px',flexWrap:'wrap'}}>
                      {HR_.map(({k,l,c})=><button key={k} onClick={()=>setPend(p=>({...p,hitResult:k}))} style={{...tog(k,pend.hitResult,c),padding:'5px 10px'}}>{l}</button>)}
                    </div>
                  </div>
                </div>
              )}
              <div style={{display:'flex',gap:'14px',marginBottom:'14px',padding:'8px 10px',background:'#060d1a',borderRadius:'6px',border:'1px solid #1e3a5f',flexWrap:'wrap',alignItems:'center'}}>
                <span style={{fontSize:'9px',fontWeight:'800',color:'#2d6a9f',textTransform:'uppercase',letterSpacing:'1px',whiteSpace:'nowrap'}}>AB Flags</span>
                {[{k:'leadoff',l:'Leadoff'},{k:'risp',l:'RISP'}].map(({k,l})=>(
                  <label key={k} style={{display:'flex',alignItems:'center',gap:'5px',cursor:'pointer',fontSize:'11px',color:'#64748b',fontWeight:'600'}}>
                    <input type="checkbox" checked={!!curAB[k]} onChange={e=>setCurAB(p=>({...p,[k]:e.target.checked}))} style={{accentColor:'#3b82f6',width:'13px',height:'13px'}}/>
                    {l}
                  </label>
                ))}
                <span style={{marginLeft:'auto',fontSize:'10px',fontWeight:'800',padding:'2px 8px',borderRadius:'4px',background:curAB.hand==='L'?'rgba(59,130,246,0.12)':'rgba(251,191,36,0.12)',color:curAB.hand==='L'?'#3b82f6':'#fbbf24',border:`1px solid ${curAB.hand==='L'?'rgba(59,130,246,0.25)':'rgba(251,191,36,0.25)'}`,fontFamily:'monospace'}}>{curAB.hand}HH</span>
              </div>
              <button className="log-btn" onClick={handleLogPitch}
                disabled={!active||!pend.fx||!pend.result||(pend.result==='InPlay'&&(!pend.hitType||!pend.hitResult))}
                style={{width:'100%',padding:'12px',borderRadius:'8px',border:'none',cursor:'pointer',fontWeight:'900',fontSize:'13px',background:'#1d4ed8',color:'#fff',marginBottom:'8px',letterSpacing:'0.5px',transition:'all 0.15s',fontFamily:'inherit',opacity:(!active||!pend.fx||!pend.result)?0.35:1}}>
                ⚾ LOG PITCH{pend.type?` · ${pend.type}`:''}  {pend.vel?`· ${pend.vel} mph`:''}
              </button>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'6px'}}>
                <button onClick={handleUndo} disabled={!curAB.pitches.length} style={{padding:'7px',borderRadius:'6px',border:'1px solid #1e3a5f',cursor:'pointer',fontWeight:'700',fontSize:'11px',background:'transparent',color:'#64748b',opacity:curAB.pitches.length?1:0.4,fontFamily:'inherit'}}>↩ Undo</button>
                <button onClick={handleNewInning} disabled={!active} style={{padding:'7px',borderRadius:'6px',border:'1px solid #1e3a5f',cursor:'pointer',fontWeight:'700',fontSize:'11px',background:'transparent',color:'#64748b',opacity:active?1:0.4,fontFamily:'inherit'}}>→ New Inning ({inning+1})</button>
              </div>
            </div>

            <div>
              <div style={card()}>
                <div style={{fontSize:'9px',fontWeight:'800',color:'#2d6a9f',textTransform:'uppercase',letterSpacing:'1.5px',marginBottom:'10px',display:'flex',alignItems:'center',gap:'8px'}}>
                  Current At-Bat · {curAB.cnt.b}–{curAB.cnt.s}
                  <span style={{padding:'2px 7px',borderRadius:'4px',fontSize:'10px',fontWeight:'900',background:curAB.hand==='L'?'rgba(59,130,246,0.15)':'rgba(251,191,36,0.15)',color:curAB.hand==='L'?'#3b82f6':'#fbbf24',border:`1px solid ${curAB.hand==='L'?'rgba(59,130,246,0.35)':'rgba(251,191,36,0.35)'}`}}>{curAB.hand}HH</span>
                </div>
                <div style={{display:'flex',flexWrap:'wrap',gap:'4px',minHeight:'32px',padding:'8px',background:'#060d1a',borderRadius:'6px',marginBottom:'10px'}}>
                  {curAB.pitches.map((p,i)=>(<div key={i} title={`${PL[p.type]} ${p.vel||''}mph Zone:${p.zone||'B'} ${p.result}`} style={{width:'26px',height:'26px',borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',background:PC[p.type]||'#475569',fontSize:'8px',fontWeight:'800',color:'#fff',border:p.result==='Ball'?'2px solid #3b82f6':p.result==='InPlay'?'2px solid #22c55e':'1px solid rgba(255,255,255,0.2)',cursor:'default',fontFamily:'monospace'}}>{p.type.slice(0,2)}</div>))}
                  {!curAB.pitches.length&&<span style={{fontSize:'11px',color:'#1e3a5f',fontStyle:'italic'}}>No pitches yet</span>}
                </div>
                <div style={{borderTop:'1px solid #1e3a5f',paddingTop:'10px'}}>
                  <div style={{fontSize:'9px',fontWeight:'800',color:'#2d6a9f',textTransform:'uppercase',letterSpacing:'1.5px',marginBottom:'6px'}}>Recent At-Bats</div>
                  {atBats.length===0&&<div style={{fontSize:'11px',color:'#1e3a5f',fontStyle:'italic'}}>No at-bats recorded</div>}
                  {[...atBats].reverse().slice(0,8).map((ab,i)=>(
                    <div key={i} style={{display:'flex',alignItems:'center',gap:'6px',padding:'5px 0',borderBottom:'1px solid #0a1929'}}>
                      <span style={{fontSize:'9px',color:'#334155',width:'14px',textAlign:'center',fontWeight:'700'}}>I{ab.inning}</span>
                      <span style={{fontSize:'9px',fontWeight:'900',padding:'1px 5px',borderRadius:'3px',background:ab.hand==='L'?'rgba(59,130,246,0.12)':'rgba(251,191,36,0.12)',color:ab.hand==='L'?'#3b82f6':'#fbbf24',border:`1px solid ${ab.hand==='L'?'rgba(59,130,246,0.25)':'rgba(251,191,36,0.25)'}`}}>{ab.hand||'R'}</span>
                      <div style={{display:'flex',gap:'2px',flex:1,flexWrap:'wrap'}}>
                        {(ab.pitches||[]).map((p,j)=>(<div key={j} style={{width:'15px',height:'15px',borderRadius:'50%',background:PC[p.type]||'#475569',border:p.result==='Ball'?'1.5px solid #3b82f6':'none',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'6px',color:'#fff',fontWeight:'800',fontFamily:'monospace'}}>{p.type.slice(0,1)}</div>))}
                      </div>
                      <span style={{fontSize:'11px',fontWeight:'800',color:resultColor(ab.result),minWidth:'28px',textAlign:'right',fontFamily:'monospace'}}>{ab.result}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {pitches.length>0&&(
            <div style={{...card({marginTop:'14px',padding:'12px'})}}>
              <div style={{fontSize:'9px',fontWeight:'800',color:'#2d6a9f',textTransform:'uppercase',letterSpacing:'1.5px',marginBottom:'10px'}}>Pitch Log — {pitches.length} pitches</div>
              <div style={{overflowX:'auto'}}>
                <table style={{width:'100%',borderCollapse:'collapse',fontSize:'11px',fontFamily:'monospace'}}>
                  <thead><tr>{['#','INN','COUNT','HAND','TYPE','VEL','ZONE','COMP','RESULT','HIT','OUTCOME','AB#'].map(h=><th key={h} style={{textAlign:'left',padding:'5px 10px',borderBottom:'1px solid #1e3a5f',color:'#334155',fontWeight:'800',fontSize:'9px',letterSpacing:'0.8px',whiteSpace:'nowrap'}}>{h}</th>)}</tr></thead>
                  <tbody>
                    {[...pitches].reverse().map((p,i)=>(
                      <tr key={i} style={{borderBottom:'1px solid #0a1929',transition:'background 0.1s'}} onMouseEnter={e=>e.currentTarget.style.background='#0a1929'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                        <td style={{padding:'5px 10px',color:'#334155'}}>{pitches.length-i}</td>
                        <td style={{padding:'5px 10px',color:'#64748b'}}>{p.inning}</td>
                        <td style={{padding:'5px 10px',fontWeight:'700',color:'#94a3b8'}}>{p.cntBefore?.b||0}-{p.cntBefore?.s||0}</td>
                        <td style={{padding:'5px 10px'}}><span style={{fontSize:'10px',fontWeight:'900',padding:'1px 5px',borderRadius:'3px',background:p.hand==='L'?'rgba(59,130,246,0.12)':'rgba(251,191,36,0.12)',color:p.hand==='L'?'#3b82f6':'#fbbf24',border:`1px solid ${p.hand==='L'?'rgba(59,130,246,0.25)':'rgba(251,191,36,0.25)'}`}}>{p.hand||'R'}</span></td>
                        <td style={{padding:'5px 10px'}}><span style={{background:PC[p.type],color:'#fff',padding:'2px 6px',borderRadius:'3px',fontWeight:'800',fontSize:'10px'}}>{p.type}</span></td>
                        <td style={{padding:'5px 10px',color:'#e2e8f0',fontWeight:'700'}}>{p.vel||'—'}</td>
                        <td style={{padding:'5px 10px',color:p.zone>0?'#94a3b8':'#3b82f6',fontWeight:'700'}}>{p.zone||'B'}</td>
                        <td style={{padding:'5px 10px',color:p.comp?'#f59e0b':'#334155',fontWeight:'700'}}>{p.comp?'●':'○'}</td>
                        <td style={{padding:'5px 10px',fontWeight:'700',color:p.result==='Ball'?'#3b82f6':p.result==='InPlay'?'#22c55e':['StrikeS','StrikeL'].includes(p.result)?'#ef4444':'#f59e0b'}}>{p.result==='StrikeL'?'Called K':p.result==='StrikeS'?'Swing K':p.result}</td>
                        <td style={{padding:'5px 10px',color:'#64748b'}}>{p.hitType&&`${p.hitType}/${p.hitStr||'?'}`}</td>
                        <td style={{padding:'5px 10px',fontWeight:'800',color:resultColor(p.hitResult)}}>{p.hitResult||'—'}</td>
                        <td style={{padding:'5px 10px',color:'#334155'}}>{p.pitchNumAB}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {tab==='analytics'&&(
        <div style={{padding:'14px 16px',maxWidth:'1320px',margin:'0 auto'}}>
          <div style={{...card({padding:'12px 16px',marginBottom:'14px',display:'flex',flexWrap:'wrap',gap:'10px',alignItems:'flex-end'})}}>
            <div><span style={lbl}>Pitcher</span><select value={ana.pitcher} onChange={e=>setAna(p=>({...p,pitcher:e.target.value,outingId:'all'}))} style={{...inp,minWidth:'160px'}}><option value="">— Select Pitcher —</option>{pitchers.map(p=><option key={p} value={p}>{p}</option>)}</select></div>
            {ana.pitcher&&(<div><span style={lbl}>Outing</span><select value={ana.outingId} onChange={e=>setAna(p=>({...p,outingId:e.target.value}))} style={{...inp,minWidth:'180px'}}><option value="all">All Outings ({anaData.outings.length})</option>{outings.filter(o=>o.pitcher===ana.pitcher).map(o=><option key={o.id} value={o.id}>{o.date} vs {o.opponent||'Opp'} ({o.pitches.length}p)</option>)}</select></div>)}
            {anaData.pitches.length>0&&(
              <div style={{display:'flex',alignItems:'center',gap:'6px',flex:'0 0 auto'}}>
                <span style={{fontSize:'9px',fontWeight:'800',color:'#475569',textTransform:'uppercase',letterSpacing:'1px'}}>View vs</span>
                {[{k:'all',l:'All',c:'#475569'},{k:'L',l:'⬡ LHH',c:'#3b82f6'},{k:'R',l:'⬡ RHH',c:'#fbbf24'}].map(({k,l,c})=>(<button key={k} onClick={()=>setAna(p=>({...p,handFilter:k}))} style={{...tog(k,ana.handFilter,c),padding:'5px 12px',fontSize:'11px'}}>{l}</button>))}
              </div>
            )}
            {anaData.pitches.length>0&&<div style={{marginLeft:'auto',fontSize:'11px',color:'#334155',fontWeight:'700'}}>{(anaData.filtPitches||anaData.pitches).length} pitches · {(anaData.filtAtBats||anaData.atBats).length} AB · {anaData.outings.length} outing{anaData.outings.length!==1?'s':''}</div>}
          </div>

          {!ana.pitcher||!anaData.pitches.length?(
            <div style={{...card(),textAlign:'center',padding:'60px',color:'#1e3a5f'}}>
              <div style={{fontSize:'48px',marginBottom:'14px'}}>⚾</div>
              <div style={{fontSize:'16px',fontWeight:'800',color:'#2d6a9f',fontFamily:'"Space Grotesk",sans-serif'}}>No data to display</div>
              <div style={{fontSize:'12px',marginTop:'6px',color:'#334155'}}>Chart live outings in the Charting tab, then analyze here</div>
            </div>
          ):(
            <>
              <div style={{display:'grid',gridTemplateColumns:'1fr 260px',gap:'14px',marginBottom:'14px'}}>
                <div style={card()}>
                  <div style={{fontSize:'9px',fontWeight:'800',color:'#2d6a9f',textTransform:'uppercase',letterSpacing:'2px',marginBottom:'6px',fontFamily:'"Space Grotesk",sans-serif',display:'flex',alignItems:'center',gap:'8px'}}>
                    Season Stats
                    {ana.handFilter!=='all'&&<span style={{padding:'2px 7px',borderRadius:'4px',fontSize:'10px',fontWeight:'900',background:ana.handFilter==='L'?'rgba(59,130,246,0.15)':'rgba(251,191,36,0.15)',color:ana.handFilter==='L'?'#3b82f6':'#fbbf24',border:`1px solid ${ana.handFilter==='L'?'rgba(59,130,246,0.3)':'rgba(251,191,36,0.3)'}`}}>vs {ana.handFilter}HH</span>}
                  </div>
                  {(anaData.filtStats||anaData.stats)&&(()=>{const s=anaData.filtStats||anaData.stats;return(
                    <div style={{display:'flex',flexDirection:'column',gap:'10px'}}>
                      {[
                        [{v:s.ip,l:'IP'},{v:s.bf,l:'BF'},{v:s.tp,l:'Pitches'},{v:s.pip,l:'P/IP'},{v:s.pbf,l:'P/BF'},{v:s.sub3pct,l:'<3%'}],
                        [{v:s.totalRuns,l:'Runs',ac:'#f43f5e'},{v:s.dps,l:'DP'},{v:s.hits,l:'Hits'},{v:s.hrs,l:'HR'},{v:s.ks,l:"K's"},{v:s.walks,l:'BB'}],
                        [{v:s.inn123,l:'123INN'},{v:s.sub13,l:'<13 INN'},{v:s.fpsPct,l:'FPS%'},{v:s.fpsoPct,l:'FPSO%'},{v:s.compPct,l:'COMP%'},{v:s.zeroWalk,l:'0BBINN'}],
                        [{v:s.bbInn,l:'BB/INN'},{v:s.lobb,l:'LOBB'},{v:s.lobbS,l:'LOBBS'},{v:s.bbsS,l:'BBS'},{v:null,l:''},{v:null,l:''}],
                        [{v:s.whiffPct,l:'WHIFF%'},{v:s.weakPct,l:'WEAK%'},{v:s.hhbPct,l:'HHB%'},{v:s.fbPct,l:'FB%'},{v:s.gbPct,l:'GB%'},{v:null,l:''}],
                        [{v:s.babip,l:'BABIP'},{v:s.baRisp,l:'BA/RISP'},{v:s.outs,l:'Outs'},{v:null,l:''},{v:null,l:''},{v:null,l:''}],
                      ].map((row,ri)=>(
                        <div key={ri} style={{display:'grid',gridTemplateColumns:'repeat(6,1fr)',gap:'6px'}}>
                          {row.map(({v,l,ac},ci)=>v!==null?<StatBox key={ci} v={v} l={l} accent={ac||(l.includes('BB')||l==='LOBBS'||l==='LOBB'?'#f59e0b':l==="K's"||l==='BABIP'||l==='BA/RISP'?'#f43f5e':undefined)}/>:<div key={ci}/>)}
                        </div>
                      ))}
                    </div>
                  )})()}
                </div>

                <div style={card()}>
                  <div style={{fontSize:'9px',fontWeight:'800',color:'#2d6a9f',textTransform:'uppercase',letterSpacing:'1.5px',marginBottom:'10px'}}>Heat Map</div>
                  <div style={{display:'flex',gap:'4px',marginBottom:'8px'}}>
                    {[{k:'all',l:'All',c:'#475569'},{k:'L',l:'LHH',c:'#3b82f6'},{k:'R',l:'RHH',c:'#fbbf24'}].map(({k,l,c})=>(<button key={k} onClick={()=>setAna(p=>({...p,handFilter:k}))} style={{...tog(k,ana.handFilter,c),fontSize:'10px',padding:'3px 9px',flex:1}}>{l}</button>))}
                  </div>
                  <div style={{display:'flex',flexWrap:'wrap',gap:'4px',marginBottom:'8px'}}>
                    <button onClick={()=>setAna(p=>({...p,filterType:'all'}))} style={{...tog('all',ana.filterType,'#475569'),fontSize:'10px',padding:'3px 8px'}}>All</button>
                    {PT.filter(t=>(anaData.filtPitches||anaData.pitches).some(p=>p.type===t)).map(t=>(<button key={t} onClick={()=>setAna(p=>({...p,filterType:t}))} style={{...tog(t,ana.filterType,PC[t]),fontSize:'10px',padding:'3px 7px'}}>{t}</button>))}
                  </div>
                  <label style={{display:'flex',alignItems:'center',gap:'5px',cursor:'pointer',fontSize:'10px',color:'#64748b',marginBottom:'8px',fontWeight:'700'}}>
                    <input type="checkbox" checked={ana.hitsOnly} onChange={e=>setAna(p=>({...p,hitsOnly:e.target.checked}))} style={{accentColor:'#f43f5e',width:'12px',height:'12px'}}/>Hits Only
                  </label>
                  <ZoneView pitches={anaData.filtPitches||anaData.pitches} filterType={ana.filterType} hitsOnly={ana.hitsOnly}/>
                  <div style={{display:'flex',flexWrap:'wrap',gap:'5px',marginTop:'8px'}}>
                    {PT.filter(t=>(anaData.filtPitches||anaData.pitches).some(p=>p.type===t)).map(t=>(<div key={t} style={{display:'flex',alignItems:'center',gap:'3px',fontSize:'9px',color:'#475569'}}><div style={{width:'7px',height:'7px',borderRadius:'50%',background:PC[t]}}/>{PL[t]}</div>))}
                  </div>
                </div>
              </div>

              {anaData.stats&&(anaData.stats.lSplit||anaData.stats.rSplit)&&(
                <div style={{...card({marginBottom:'14px'})}}>
                  <div style={{fontSize:'9px',fontWeight:'800',color:'#2d6a9f',textTransform:'uppercase',letterSpacing:'2px',marginBottom:'14px',fontFamily:'"Space Grotesk",sans-serif'}}>L / R Splits</div>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'12px'}}>
                    {[{hand:'L',split:anaData.stats.lSplit,c:'#3b82f6',bg:'rgba(59,130,246,0.06)'},{hand:'R',split:anaData.stats.rSplit,c:'#fbbf24',bg:'rgba(251,191,36,0.06)'}].map(({hand,split,c,bg})=>(
                      <div key={hand} style={{background:bg,border:`1px solid ${c}22`,borderRadius:'8px',padding:'12px'}}>
                        <div style={{display:'flex',alignItems:'center',gap:'8px',marginBottom:'12px'}}>
                          <span style={{fontSize:'16px',fontWeight:'900',color:c,fontFamily:'monospace'}}>{hand}HH</span>
                          <span style={{fontSize:'11px',color:'#475569',fontWeight:'700'}}>{split?`${split.bf} AB · ${split.tp} pitches`:'No data'}</span>
                        </div>
                        {split?(
                          <>
                            <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:'6px',marginBottom:'10px'}}>
                              {[{v:split.ba,l:'BA',ac:parseFloat(split.ba)>=0.300?'#f43f5e':undefined},{v:split.babip,l:'BABIP'},{v:split.kPct,l:'K%',ac:'#22c55e'},{v:split.bbPct,l:'BB%',ac:'#f59e0b'},{v:split.whiffPct,l:'Whiff%'},{v:split.fpsPct,l:'FPS%'},{v:split.gbPct,l:'GB%'},{v:split.fbPct,l:'FB%'}].map(({v,l,ac},i)=>(
                                <div key={i} style={{textAlign:'center',padding:'7px 4px',background:'#060d1a',borderRadius:'6px',border:'1px solid #1e3a5f'}}>
                                  <div style={{fontSize:'15px',fontWeight:'900',color:ac||'#e2e8f0',lineHeight:1,fontFamily:'monospace'}}>{v||'—'}</div>
                                  <div style={{fontSize:'8px',color:'#475569',marginTop:'2px',fontWeight:'700',textTransform:'uppercase',letterSpacing:'0.5px'}}>{l}</div>
                                </div>
                              ))}
                            </div>
                            <div style={{fontSize:'9px',fontWeight:'800',color:'#334155',textTransform:'uppercase',letterSpacing:'1px',marginBottom:'6px'}}>Pitch Mix</div>
                            <div style={{display:'flex',flexDirection:'column',gap:'4px'}}>
                              {PT.filter(t=>split.ptBk[t]?.n>0).sort((a,b)=>split.ptBk[b].n-split.ptBk[a].n).map(t=>{
                                const d=split.ptBk[t];const whiffPct=d.n>0?Math.round(d.whiff/d.n*100):0;
                                return(<div key={t} style={{display:'flex',alignItems:'center',gap:'6px',fontSize:'10px'}}><span style={{background:PC[t],color:'#fff',padding:'1px 5px',borderRadius:'3px',fontWeight:'800',fontSize:'9px',minWidth:'24px',textAlign:'center',fontFamily:'monospace'}}>{t}</span><div style={{flex:1,height:'5px',background:'#0a1929',borderRadius:'3px',overflow:'hidden'}}><div style={{width:d.pct+'%',height:'100%',background:PC[t],borderRadius:'3px',transition:'width 0.3s'}}/></div><span style={{color:'#e2e8f0',fontWeight:'700',minWidth:'30px',fontFamily:'monospace'}}>{d.pct}%</span><span style={{color:'#334155',minWidth:'14px',fontFamily:'monospace',fontSize:'9px'}}>{d.n}p</span>{whiffPct>0&&<span style={{color:'#22c55e',fontSize:'9px',fontWeight:'700'}}>{whiffPct}%K</span>}</div>);
                              })}
                            </div>
                          </>
                        ):<div style={{fontSize:'11px',color:'#1e3a5f',fontStyle:'italic',textAlign:'center',padding:'16px 0'}}>No {hand}HH at-bats recorded</div>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'14px'}}>
                <div style={card()}>
                  <div style={{fontSize:'9px',fontWeight:'800',color:'#2d6a9f',textTransform:'uppercase',letterSpacing:'1.5px',marginBottom:'4px'}}>Count Breakdown + Pitch Mix</div>
                  <div style={{fontSize:'9px',color:'#334155',marginBottom:'10px'}}>At-bat results & pitch selection at each count</div>
                  {anaData.stats&&COUNTS.map(c=>{
                    const d=anaData.stats.countBk[c]||{n:0,outs:0,hits:0};
                    const mix=anaData.stats.countPitchMix?.[c]||{total:0,byType:{}};
                    const outPct=d.n>0?Math.round(d.outs/d.n*100):null;
                    const hitPct=d.n>0?Math.round(d.hits/d.n*100):null;
                    const usedTypes=PT.filter(t=>mix.byType[t]?.pct>0).sort((a,b)=>(mix.byType[b]?.pct||0)-(mix.byType[a]?.pct||0));
                    return(
                      <div key={c} style={{marginBottom:'10px',padding:'8px',background:'#060d1a',borderRadius:'6px',border:'1px solid #0d1f33',opacity:mix.total===0?0.35:1}}>
                        <div style={{display:'flex',alignItems:'center',gap:'8px',marginBottom:'6px'}}>
                          <span style={{fontSize:'13px',fontWeight:'900',color:'#e2e8f0',fontFamily:'monospace',minWidth:'30px'}}>{c}</span>
                          <span style={{fontSize:'10px',color:'#475569',fontWeight:'700'}}>{mix.total}p · {d.n}AB</span>
                          <div style={{marginLeft:'auto',display:'flex',gap:'6px'}}>
                            {outPct!=null&&<span style={{fontSize:'10px',fontWeight:'800',color:outPct>=60?'#22c55e':outPct>=40?'#f59e0b':'#ef4444',background:outPct>=60?'rgba(34,197,94,0.08)':outPct>=40?'rgba(245,158,11,0.08)':'rgba(239,68,68,0.08)',padding:'1px 5px',borderRadius:'3px'}}>{outPct}% OUT</span>}
                            {hitPct!=null&&hitPct>0&&<span style={{fontSize:'10px',fontWeight:'800',color:'#f43f5e',background:'rgba(244,63,94,0.08)',padding:'1px 5px',borderRadius:'3px'}}>{hitPct}% HIT</span>}
                          </div>
                        </div>
                        {mix.total>0?(
                          <div style={{display:'flex',flexDirection:'column',gap:'6px'}}>
                            <div>
                              <div style={{fontSize:'8px',fontWeight:'700',color:'#334155',textTransform:'uppercase',letterSpacing:'0.8px',marginBottom:'3px'}}>Pitch Selection</div>
                              <div style={{display:'flex',height:'8px',borderRadius:'4px',overflow:'hidden',gap:'1px'}}>
                                {usedTypes.map(t=>(<div key={t} style={{width:mix.byType[t].pct+'%',background:PC[t],minWidth:mix.byType[t].pct>0?'3px':0,transition:'width 0.3s'}} title={`${t}: ${mix.byType[t].pct}%`}/>))}
                              </div>
                              <div style={{display:'flex',flexWrap:'wrap',gap:'4px',marginTop:'3px'}}>
                                {usedTypes.map(t=>(<div key={t} style={{display:'flex',alignItems:'center',gap:'3px',fontSize:'9px'}}><div style={{width:'6px',height:'6px',borderRadius:'2px',background:PC[t],flexShrink:0}}/><span style={{color:'#e2e8f0',fontWeight:'800',fontFamily:'monospace'}}>{t}</span><span style={{color:'#475569',fontWeight:'700'}}>{mix.byType[t].pct}%</span></div>))}
                              </div>
                            </div>
                            <div>
                              <div style={{fontSize:'8px',fontWeight:'700',color:'#334155',textTransform:'uppercase',letterSpacing:'0.8px',marginBottom:'3px'}}>Next Pitch Result</div>
                              <div style={{display:'flex',height:'8px',borderRadius:'4px',overflow:'hidden',gap:'1px'}}>
                                {mix.strikePct>0&&<div style={{width:mix.strikePct+'%',background:'#22c55e',minWidth:'3px',transition:'width 0.3s'}}/>}
                                {mix.ballPct>0&&<div style={{width:mix.ballPct+'%',background:'#ef4444',minWidth:'3px',transition:'width 0.3s'}}/>}
                                {mix.inPlayPct>0&&<div style={{width:mix.inPlayPct+'%',background:'#f59e0b',minWidth:'3px',transition:'width 0.3s'}}/>}
                              </div>
                              <div style={{display:'flex',gap:'8px',marginTop:'3px'}}>
                                {mix.strikePct>0&&<div style={{display:'flex',alignItems:'center',gap:'3px',fontSize:'9px'}}><div style={{width:'6px',height:'6px',borderRadius:'2px',background:'#22c55e',flexShrink:0}}/><span style={{color:'#22c55e',fontWeight:'800'}}>Strike</span><span style={{color:'#475569',fontWeight:'700'}}>{mix.strikePct}%</span><span style={{color:'#334155',fontSize:'8px'}}>({mix.nStrike})</span></div>}
                                {mix.ballPct>0&&<div style={{display:'flex',alignItems:'center',gap:'3px',fontSize:'9px'}}><div style={{width:'6px',height:'6px',borderRadius:'2px',background:'#ef4444',flexShrink:0}}/><span style={{color:'#ef4444',fontWeight:'800'}}>Ball</span><span style={{color:'#475569',fontWeight:'700'}}>{mix.ballPct}%</span><span style={{color:'#334155',fontSize:'8px'}}>({mix.nBall})</span></div>}
                                {mix.inPlayPct>0&&<div style={{display:'flex',alignItems:'center',gap:'3px',fontSize:'9px'}}><div style={{width:'6px',height:'6px',borderRadius:'2px',background:'#f59e0b',flexShrink:0}}/><span style={{color:'#f59e0b',fontWeight:'800'}}>In Play</span><span style={{color:'#475569',fontWeight:'700'}}>{mix.inPlayPct}%</span><span style={{color:'#334155',fontSize:'8px'}}>({mix.nInPlay})</span></div>}
                              </div>
                            </div>
                          </div>
                        ):<div style={{fontSize:'10px',color:'#1e3a5f',fontStyle:'italic'}}>No pitches recorded at this count</div>}
                      </div>
                    );
                  })}
                </div>

                <div style={card()}>
                  <div style={{fontSize:'9px',fontWeight:'800',color:'#2d6a9f',textTransform:'uppercase',letterSpacing:'1.5px',marginBottom:'12px'}}>Pitch Arsenal</div>
                  <table style={{width:'100%',borderCollapse:'collapse',fontSize:'11px',fontFamily:'monospace'}}>
                    <thead><tr>{['Pitch','#','Usage','Whiff%','AvgVel','Balls'].map(h=><th key={h} style={{textAlign:'left',padding:'5px 8px',borderBottom:'1px solid #1e3a5f',color:'#334155',fontWeight:'800',fontSize:'9px',letterSpacing:'0.5px'}}>{h}</th>)}</tr></thead>
                    <tbody>
                      {anaData.stats&&PT.filter(t=>anaData.stats.ptBreak[t]?.n>0).sort((a,b)=>anaData.stats.ptBreak[b].n-anaData.stats.ptBreak[a].n).map(t=>{
                        const d=anaData.stats.ptBreak[t];
                        return(
                          <tr key={t} style={{borderBottom:'1px solid #0a1929'}}>
                            <td style={{padding:'6px 8px'}}><span style={{background:PC[t],color:'#fff',padding:'2px 6px',borderRadius:'3px',fontWeight:'800',fontSize:'10px'}}>{t}</span><span style={{marginLeft:'5px',color:'#334155',fontSize:'10px'}}>{PL[t]}</span></td>
                            <td style={{padding:'6px 8px',color:'#64748b'}}>{d.n}</td>
                            <td style={{padding:'6px 8px'}}><div style={{display:'flex',alignItems:'center',gap:'5px'}}><div style={{width:'50px',height:'5px',background:'#0a1929',borderRadius:'3px',overflow:'hidden'}}><div style={{width:d.pct+'%',height:'100%',background:PC[t],borderRadius:'3px'}}/></div><span style={{color:'#e2e8f0',fontWeight:'700',fontSize:'11px'}}>{d.pct}%</span></div></td>
                            <td style={{padding:'6px 8px',color:d.n>0&&Math.round(d.whiff/d.n*100)>=25?'#22c55e':'#64748b',fontWeight:'700'}}>{d.n>0?Math.round(d.whiff/d.n*100)+'%':'—'}</td>
                            <td style={{padding:'6px 8px',color:'#e2e8f0',fontWeight:'800'}}>{d.avgVel||'—'}</td>
                            <td style={{padding:'6px 8px',color:d.n>0&&Math.round(d.ball/d.n*100)>=40?'#f43f5e':'#64748b'}}>{d.n>0?Math.round(d.ball/d.n*100)+'%':'—'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {anaData.pitches.some(p=>p.result==='InPlay'&&['1B','2B','3B','HR'].includes(p.hitResult))&&(
                    <div style={{marginTop:'14px',borderTop:'1px solid #1e3a5f',paddingTop:'12px'}}>
                      <div style={{fontSize:'9px',fontWeight:'800',color:'#2d6a9f',textTransform:'uppercase',letterSpacing:'1.5px',marginBottom:'10px'}}>Location of Hits by Pitch Type</div>
                      {PT.filter(t=>anaData.pitches.some(p=>p.type===t&&p.result==='InPlay'&&['1B','2B','3B','HR'].includes(p.hitResult))).map(t=>{
                        const all=anaData.pitches.filter(p=>p.type===t).length;
                        const hitPs=anaData.pitches.filter(p=>p.type===t&&p.result==='InPlay'&&['1B','2B','3B','HR'].includes(p.hitResult));
                        return(
                          <div key={t} style={{display:'flex',alignItems:'center',gap:'7px',marginBottom:'6px',fontSize:'11px',fontFamily:'monospace'}}>
                            <span style={{background:PC[t],color:'#fff',padding:'1px 5px',borderRadius:'3px',fontWeight:'800',fontSize:'9px',minWidth:'26px',textAlign:'center'}}>{t}</span>
                            <span style={{color:'#f43f5e',fontWeight:'800'}}>{hitPs.length}H</span>
                            <span style={{color:'#334155'}}>({all>0?Math.round(hitPs.length/all*100):0}%)</span>
                            <div style={{display:'flex',gap:'3px',marginLeft:'auto'}}>
                              {['1B','2B','3B','HR'].map(hr=>{const n=hitPs.filter(p=>p.hitResult===hr).length;return n>0?<span key={hr} style={{fontSize:'9px',color:'#94a3b8',background:'#0a1929',padding:'1px 4px',borderRadius:'2px',fontWeight:'700'}}>{hr}×{n}</span>:null})}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
