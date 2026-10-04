import { nutrientNames, LedgerError } from '../contracts.ts';
import type { Settings, LedgerRecord, IntakeSummary, TodayPlan, ExercisePrescription, Suggestion, Review, WeightPoint } from '../contracts.ts';

export function defaultSettings(): Settings {
  return { locale:'zh-TW', timezone:'Asia/Taipei', start_date:null, target_date:null, self_reported_height_cm:null,self_reported_weight_kg:null,energy_kcal:{min:1900,max:2100},protein_g:{min:110,max:140},carbs_target_g:null,fat_target_g:null,dumbbell_inventory_kg:null,dumbbell_increment_kg:null,food_restrictions:null,food_budget_twd:null };
}
export function taipeiToday(now = new Date()):string { return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(now); }
export function shiftDate(date:string,days:number):string { const d=new Date(`${date}T00:00:00Z`);d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10); }
const SCALE=1000000n;
type Rational={n:bigint;d:bigint};
function gcd(a:bigint,b:bigint):bigint { while(b){const t=a%b;a=b;b=t;}return a; }
function rational(n:bigint,d=1n):Rational {const g=gcd(n,d);return {n:n/g,d:d/g};}
function fixed(value:number):bigint { return BigInt(value.toFixed(6).replace('.','')); }
function add(a:Rational,b:Rational):Rational{return rational(a.n*b.d+b.n*a.d,a.d*b.d);}
function displayed(value:Rational,places:number):number {const scale=10n**BigInt(places);return Number((value.n*scale*2n+value.d)/(2n*value.d))/Number(scale);}
function portion(value:number,prepared:number,basis:number,fraction:number):Rational {return rational(fixed(value)*fixed(prepared)*fixed(fraction),SCALE*SCALE*fixed(basis));}
export function summarizeIntake(records:LedgerRecord[],date?:string):IntakeSummary {
  const selected=records.filter(r=>date===undefined||r.local_date===date);
  const nutrients=Object.fromEntries(nutrientNames.map(n=>[n,{range:null,unknown_items:0}])) as IntakeSummary['nutrients'];
  const totals=Object.fromEntries(nutrientNames.map(n=>[n,{min:rational(0n),max:rational(0n),known:false}])) as Record<typeof nutrientNames[number],{min:Rational;max:Rational;known:boolean}>;
  let confirmed=0,pending=0,vegetables:Rational|null=null,fruits:Rational|null=null;
  for(const record of selected){
    if(record.kind!=='meal')continue;
    const meal=record.data;
    if(!record.date_confirmed||meal.analysis_status!=='ready'||meal.consumption_status==='unknown')pending++;
    if(!record.date_confirmed||meal.consumption_status!=='confirmed_consumed')continue;
    confirmed++;
    for(const item of meal.items){
      if(item.consumed_fraction===0)continue;
      for(const name of nutrientNames){const range=item.nutrients[name];
        if(range===null||item.consumed_fraction===null){nutrients[name].unknown_items++;continue;}
        const total=totals[name];total.known=true;
        total.min=add(total.min,portion(range.min,item.prepared_quantity,item.basis_quantity,item.consumed_fraction));
        total.max=add(total.max,portion(range.max,item.prepared_quantity,item.basis_quantity,item.consumed_fraction));
      }
      if(item.consumed_fraction!==null){
        if(item.vegetable_servings!==null)vegetables=add(vegetables??rational(0n),rational(fixed(item.vegetable_servings)*fixed(item.consumed_fraction),SCALE*SCALE));
        if(item.fruit_servings!==null)fruits=add(fruits??rational(0n),rational(fixed(item.fruit_servings)*fixed(item.consumed_fraction),SCALE*SCALE));
      }
    }
  }
  for(const n of nutrientNames){const t=totals[n];if(t.known)nutrients[n].range={min:displayed(t.min,n==='kcal'?1:2),max:displayed(t.max,n==='kcal'?1:2)};}
  return {nutrients,confirmed_meals:confirmed,pending_meals:pending,day_complete:selected.some(r=>r.kind==='note'&&r.date_confirmed&&r.data.day_complete),vegetable_servings:vegetables===null?null:displayed(vegetables,2),fruit_servings:fruits===null?null:displayed(fruits,2)};
}
function exercise(id:ExercisePrescription['id'],name:string,reps:[number,number]|null,mode:ExercisePrescription['load_mode'],unilateral=false,core=false,cues=''):ExercisePrescription {
 return {id,name,sets:core?2:3,reps_min:reps?.[0]??null,reps_max:reps?.[1]??null,seconds_min:id==='plank'?20:null,seconds_max:id==='plank'?40:null,unilateral,load_mode:mode,rest_seconds:core?[45,60]:['goblet_squat','dumbbell_rdl','reverse_lunge'].includes(id)?[90,120]:[90,90],cues};
}
const A=[exercise('goblet_squat','高腳杯深蹲',[8,12],'single_dumbbell_total',false,false,'啞鈴靠胸，腳掌穩定，控制深度'),exercise('dumbbell_rdl','啞鈴羅馬尼亞硬舉',[8,12],'per_dumbbell',false,false,'臀部後推，啞鈴靠腿，不追求碰地'),exercise('floor_press','啞鈴地板胸推',[8,12],'per_dumbbell',false,false,'上臂輕觸地面，不撞地反彈'),exercise('one_arm_row','單臂啞鈴划船',[8,12],'single_active_dumbbell',true,false,'軀幹穩定，不靠轉身甩動'),exercise('dead_bug','Dead Bug',[6,8],'bodyweight',true,true,'慢做，保持腰背控制')];
const B=[exercise('reverse_lunge','反向弓箭步',[8,10],'per_dumbbell',true,false,'前腳穩定，平衡不穩先徒手'),exercise('glute_bridge','臀橋',[10,15],'external_total',false,false,'不刻意拱腰，徒手不足再加啞鈴'),exercise('shoulder_press','啞鈴肩推',[8,12],'per_dumbbell',false,false,'腹部收穩，不後仰頂起'),A[3],exercise('plank','平板支撐',null,'bodyweight',false,true,'維持呼吸，姿勢失控就結束')];
function ordered(records:LedgerRecord[]):LedgerRecord[]{return [...records].sort((a,b)=>a.local_date.localeCompare(b.local_date)||a.created_at.localeCompare(b.created_at)||a.id.localeCompare(b.id));}
function recoveryEvidence(records:LedgerRecord[],date:string):boolean {const past=ordered(records.filter(r=>r.date_confirmed&&r.local_date<=date));const sessions=past.filter(r=>r.kind==='workout'&&['completed','partial'].includes(r.data.status));const latest=sessions.at(-1);return latest?.kind==='workout'&&latest.data.recovery_ok===true&&!latest.data.safety_hold&&(latest.data.activity!=='strength'||latest.data.sets.some(s=>s.set_type==='work'))&&latest.data.sets.filter(s=>s.set_type==='work').every(s=>s.pain===false)&&!past.filter(r=>r.local_date>=latest.local_date).some(r=>r.kind==='note'&&(r.data.fatigue==='poor'||r.data.soreness==='affects_movement'||(r.data.sleep_hours!==null&&r.data.sleep_hours<7)));}
export function buildTodayPlan(date:string,settings:Settings,records:LedgerRecord[]=[]):TodayPlan {
 const weekday=new Date(`${date}T00:00:00Z`).getUTCDay();
 const week=settings.start_date&&date>=settings.start_date?Math.floor((Date.parse(`${date}T00:00:00Z`)-Date.parse(`${settings.start_date}T00:00:00Z`))/604800000)+1:null;
 const phase=!settings.start_date?'template':week===null?'before_start':week>4?'review_needed':'active';
 const recovered=recoveryEvidence(records,date);
 const plan:TodayPlan={date,weekday,week,phase,title:'休息或平地輕鬆走',activity:'recovery',template:null,duration_minutes:[0,30],warmup_minutes:0,cooldown_minutes:0,exercises:[],instructions:[],progression_pending:false};
 if(weekday===1){Object.assign(plan,{title:'原本 Popping 練習',activity:'dance',duration_minutes:null,warmup_minutes:5,cooldown_minutes:3});plan.instructions=['暖身 5–8 分鐘，結束輕鬆活動 3–5 分鐘；總課程時間尚未知。','從現有練習取四回，每回 45–60 秒、間休 90 秒，約七成用力；若已有足夠 round，不再加做。','記錄最後 15 秒的幅度、腳步、hit 及先疲勞部位。'];}
 if([2,4,6].includes(weekday)){
   const template=weekday===4?'B':'A';Object.assign(plan,{title:`全身重訓 ${template}`,activity:'strength',template,duration_minutes:template==='A'?[50,60]:[45,55],warmup_minutes:8,cooldown_minutes:3});
   plan.exercises=(template==='A'?A:B).map(e=>({...e,rest_seconds:[...e.rest_seconds] as [number,number],sets:week===1&&([2,4].includes(weekday)||(weekday===6&&!recovered))?2:e.sets}));
   plan.instructions=['暖身含輕鬆走三分鐘、徒手深蹲與髖折疊各八下、肩部活動及輕重量試做；星期四加入徒手反向弓箭步。','起始重量留空；下放約兩秒，完成後仍可做 2–3 下。暖身組不計工作組。','單側左右都完成才算一組；一般休 90 秒，腿部可休 120 秒或更久，核心 45–60 秒。','時間不足先取消可選末段走路，保留必要休息；達一小時就結束並記錄未完成，不到恢復日補課。'];
   if(template==='A')plan.instructions.push('有餘裕才在末段輕鬆走 5–8 分鐘，不開高坡度。');
   if(week===1&&weekday===6)plan.instructions.push(recovered?'已有恢復正常證據，可採標準三組，仍不自動加重。':'恢復未確認或不佳，主要動作維持兩組。');
 }
 if(weekday===3||weekday===5){Object.assign(plan,{title:'穩定慢跑',activity:'run',duration_minutes:[30,35],warmup_minutes:5,cooldown_minutes:5});plan.instructions=['坡度起點 0%；速度可由約 7.5 km/h 試起，能說完整句子為原則，必要時降速或跑走交替。','暖身走五分鐘，主要慢跑 20–25 分鐘，緩和走五分鐘。'];
   if(week!==null&&week>1&&week<=4){
    plan.progression_pending=!recovered;
    if(weekday===3&&recovered){plan.duration_minutes=week===2?[35,35]:week===3?[40,40]:[35,40];plan.instructions[1]=`暖身五分鐘，主要慢跑${week===2?'約 25':week===3?'約 30':'25–30'}分鐘，緩和五分鐘；依恢復調整。`;}
    const steady=records.filter(r=>r.kind==='workout'&&r.date_confirmed&&r.local_date<date&&r.local_date>=shiftDate(date,-14)&&r.data.activity==='run'&&r.data.status==='completed'&&r.data.duration_seconds!==null&&r.data.duration_seconds>=1800&&r.data.recovery_ok===true&&r.data.talk_test==='full_sentences'&&!r.data.safety_hold&&r.data.sets.filter(s=>s.set_type==='work').every(s=>s.pain===false)).length>=2;
    if(weekday===5&&recovered&&steady){plan.title='條件式變速跑';plan.warmup_minutes=8;plan.duration_minutes=week===2?[25,25]:week===3?[25,31]:[25,31];plan.instructions[1]=`暖身八分鐘，每回稍快跑一分鐘＋輕鬆走／跑兩分鐘，${week===2?'四回':week===3?'最多六回':'四至六回'}，緩和五分鐘；稍快段約 7/10，不是全力衝刺。`;plan.progression_pending=false;}
    else if(weekday===5){plan.progression_pending=true;plan.instructions.push('先確認穩定跑可重現、無異常不適及隔日恢复正常；步態受痠痛影響時改輕鬆走 20–30 分鐘或休息。');}
    if(!recovered)plan.instructions.push('缺少明確恢復證據，先維持原量，不因週次自动加量。');
   }
 }
 if(weekday===0)plan.instructions=['完全休息，或平地輕鬆走 20–30 分鐘；不開高坡度、不補課，也不因飲食加量。'];
 if(phase==='review_needed')plan.instructions.push('四週模板已結束，先回顧並確認新計畫，不自動套用下一輪進階。');
 const holds=records.some(r=>r.date_confirmed&&r.local_date===date&&r.kind==='workout'&&r.data.safety_hold);
 if(holds){plan.title='停止進階並檢視異常';plan.activity='recovery';plan.exercises=[];plan.duration_minutes=null;plan.progression_pending=true;plan.instructions.push('已有安全暫停紀錄，先停止活動；嚴重呼吸困難、胸部疼痛或接近昏倒時尋求緊急醫療協助，不透過加練或降速繼續。');}
 if(settings.target_date&&date<=settings.target_date&&date>=shiftDate(settings.target_date,-3)){plan.progression_pending=true;if(plan.activity==='run'){plan.title='減少疲勞：休息或平地輕鬆走';plan.activity='recovery';plan.duration_minutes=[0,30];plan.warmup_minutes=0;plan.cooldown_minutes=0;plan.instructions=['休息或平地輕鬆走 20–30 分鐘，不加變速回合。'];}else if(plan.activity==='strength'){plan.title+='（減少疲勞）';plan.exercises=plan.exercises.map(e=>({...e,sets:Math.min(e.sets,2)}));}plan.instructions.push('距已確認目標日三天內：減少疲勞，不加量、不嘗試新動作，不把腿練到嚴重痠痛。');}
 return plan;
}
export function paceToSpeed(pace:string):number {const match=/^(\d+):([0-5]\d)$/.exec(pace);if(!match||Number(match[1])*60+Number(match[2])===0)throw new LedgerError('invalid_pace','配速格式須為分:秒');return 3600/(Number(match[1])*60+Number(match[2]));}
export function intervalDurationMinutes(rounds:number):number {if(!Number.isInteger(rounds)||rounds<0)throw new LedgerError('invalid_rounds','回合數須為非負整數');return 8+rounds*3+5;}
export function progressionSuggestions(records:LedgerRecord[],settings:Settings|((date:string)=>Settings)):Suggestion[]{
 const resolve=typeof settings==='function'?settings:()=>settings; const sorted=ordered(records.filter(r=>r.date_confirmed&&r.kind==='workout'&&r.data.activity==='strength'&&['completed','partial'].includes(r.data.status)));
 const result:Suggestion[]=[];
 for(const definition of [...A,...B].filter((e,i,all)=>all.findIndex(x=>x.id===e.id)===i)){
  const sessions=sorted.filter(r=>r.kind==='workout'&&r.data.sets.some(s=>s.exercise_id===definition.id&&s.set_type==='work')).slice(-2);
  if(sessions.length!==2)continue;
  const groups=sessions.map(r=>r.kind==='workout'?r.data.sets.filter(s=>s.exercise_id===definition.id&&s.set_type==='work'):[]);
  const first=groups[0][0];if(first.load_kg===null||first.load_mode==='bodyweight')continue;
  const valid=sessions.every((r,i)=>{
   if(r.kind!=='workout'||r.data.recovery_ok!==true||r.data.safety_hold)return false;
   const prescription=buildTodayPlan(r.local_date,resolve(r.local_date),records.filter(x=>x.id!==r.id)).exercises.find(e=>e.id===definition.id)??definition;
   return groups[i].length===prescription.sets&&groups[i].every(s=>s.load_mode===first.load_mode&&s.load_kg===first.load_kg&&s.rir!==null&&s.rir>=2&&s.rir<=3&&s.controlled_form===true&&s.pain===false&&(definition.unilateral?s.left_reps!==null&&s.right_reps!==null&&s.left_reps>=(prescription.reps_max??Infinity)&&s.right_reps>=(prescription.reps_max??Infinity):prescription.reps_max!==null?s.reps!==null&&s.reps>=prescription.reps_max:s.duration_seconds!==null&&s.duration_seconds>=(prescription.seconds_max??Infinity)));
  });
  if(!valid)continue;
  const last=sessions[1];if(!recoveryEvidence(records,last.local_date))continue;
  if(ordered(records).some(r=>r.local_date>=last.local_date&&((r.kind==='workout'&&(r.data.safety_hold||r.data.recovery_ok===false||r.data.sets.some(s=>s.pain===true)))||(r.kind==='note'&&(r.data.fatigue==='poor'||r.data.soreness==='affects_movement')))))continue;
  const config=resolve(last.local_date);let next:number|null=null;
  if(config.dumbbell_inventory_kg)next=[...config.dumbbell_inventory_kg].filter(v=>v>first.load_kg!).sort((a,b)=>a-b)[0]??null;
  else if(config.dumbbell_increment_kg!==null)next=displayed(rational(fixed(first.load_kg)+fixed(config.dumbbell_increment_kg),SCALE),6);
  result.push({id:`progress-${definition.id}`,title:next===null?'請補充最小啞鈴級距':`${definition.name}可考慮加重`,detail:next===null?'連續兩次同模式工作組達標，但器材級距未知；請確認可用重量。':`同負荷模式 ${first.load_mode} 連續兩次達標，可考慮由 ${first.load_kg} kg 至 ${next} kg；這只是建議，尚未套用。`,category:next===null?'data':'training',requires_confirmation:true});
 }
 return result;
}
export function foodSuggestions(intake:IntakeSummary,settings:Settings):Suggestion[]{
 const energy=intake.nutrients.kcal,protein=intake.nutrients.protein_g;
 if(energy.range===null||protein.range===null||energy.unknown_items||protein.unknown_items||intake.pending_meals)return [{id:'food-data',title:'先補充食用比例或標示',detail:'目前有待確認或未知營養；已知小計不等於完整攝取，先確認再安排補足。',category:'data',requires_confirmation:false}];
 if(protein.range.min>=settings.protein_g.min&&energy.range.min>=settings.energy_kcal.min)return [{id:'food-enough',title:'目前不需要額外補買',detail:'已回報的蛋白質與試行熱量範圍已足夠；下一餐正常安排，不吃回機器估算消耗。',category:'food',requires_confirmation:false}];
 const suggestions:Suggestion[]=[];
 if(protein.range.max<settings.protein_g.min)suggestions.push({id:'food-protein',title:'依剩餘餐次安排蛋白質',detail:settings.protein_g.min-protein.range.max>=20?'可選一包即食雞胸，核對整包標示蛋白質約 20 g 以上；或適合限制的替代品。只有確認實際吃下才入帳。':'可按缺口選茶葉蛋 1–2 顆或無糖豆漿，核對容量與營養標示，不固定全部加。',category:'food',requires_confirmation:false});
 if(intake.vegetable_servings===null||intake.vegetable_servings<3)suggestions.push({id:'food-vegetables',title:'下一餐安排蔬菜',detail:'可選生菜沙拉、加熱蔬菜或關東煮蔬菜，確認實際份量與醬料；不把一小撮當一份。',category:'food',requires_confirmation:false});
 return suggestions.slice(0,2);
}
function points(records:LedgerRecord[],metric:'weight_kg'|'waist_cm'):WeightPoint[]{const byDate=new Map<string,LedgerRecord>();for(const r of ordered(records)){if(r.kind==='measurement'&&r.date_confirmed&&r.data.metric===metric&&(metric!=='weight_kg'||r.data.morning===true))byDate.set(r.local_date,r);}return [...byDate.values()].map(r=>({date:r.local_date,value:r.kind==='measurement'?r.data.value:0}));}
export function buildReview(records:LedgerRecord[],date:string):Review {
 const from=shiftDate(date,-13),currentFrom=shiftDate(date,-6);const selected=records.filter(r=>r.local_date>=from&&r.local_date<=date);const weight=points(selected,'weight_kg'),waist=points(selected,'waist_cm');
 const window=(start:string,end:string)=>{const p=weight.filter(v=>v.date>=start&&v.date<=end);return {from:start,to:end,sample_count:p.length,average_kg:p.length>=3?displayed(rational(p.reduce((a,x)=>a+fixed(x.value),0n),SCALE*BigInt(p.length)),3):null};};
 const current=window(currentFrom,date),previous=window(from,shiftDate(currentFrom,-1));
 const workouts=selected.filter(r=>r.kind==='workout'&&r.date_confirmed&&['completed','partial'].includes(r.data.status));
 const reported=new Set(selected.filter(r=>r.kind==='meal'&&r.date_confirmed&&r.data.consumption_status==='confirmed_consumed').map(r=>r.local_date));
 const complete=new Set(selected.filter(r=>r.kind==='note'&&r.date_confirmed&&r.data.day_complete).map(r=>r.local_date));
 const flags=selected.filter(r=>r.date_confirmed&&((r.kind==='workout'&&(r.data.safety_hold||r.data.recovery_ok===false||r.data.sets.some(s=>s.pain===true)))||(r.kind==='note'&&(r.data.fatigue==='poor'||r.data.soreness==='affects_movement'||(r.data.sleep_hours!==null&&r.data.sleep_hours<7))))).length;
 const change=current.average_kg===null||previous.average_kg===null?null:Number((current.average_kg-previous.average_kg).toFixed(3));
 const performanceKnown=workouts.length>0&&workouts.every(r=>{
  if(r.kind!=='workout')return false;
  if(r.data.activity==='strength'){const work=r.data.sets.filter(s=>s.set_type==='work');return work.length>0&&work.every(s=>(s.load_kg!==null||s.load_mode==='bodyweight')&&(s.reps!==null||(s.left_reps!==null&&s.right_reps!==null)||s.duration_seconds!==null)&&s.rir!==null&&s.controlled_form!==null&&s.pain!==null);}
  if(r.data.activity==='run')return r.data.duration_seconds!==null&&r.data.distance_km!==null&&r.data.talk_test!=='unknown';
  if(r.data.activity==='dance')return r.data.rounds!==null&&r.data.round_seconds!==null&&r.data.round_quality.trim().length>0;
  return true;
 });
 const recoveryKnown=workouts.length>0&&workouts.every(r=>r.kind==='workout'&&r.data.recovery_ok!==null);
 const performance=new Map<string,number[]>();
 for(const r of ordered(workouts)){if(r.kind!=='workout'||r.data.activity!=='strength')continue;const groups=new Map<string,number[]>();for(const s of r.data.sets){if(s.set_type!=='work')continue;const value=s.left_reps!==null&&s.right_reps!==null?Math.min(s.left_reps,s.right_reps):s.reps??s.duration_seconds;if(value===null)continue;const key=JSON.stringify([s.exercise_id,s.load_mode,s.load_kg,s.duration_seconds!==null&&s.reps===null?'seconds':'reps']);groups.set(key,[...(groups.get(key)??[]),value]);}for(const [key,values] of groups){const mean=values.reduce((a,b)=>a+b,0)/values.length;performance.set(key,[...(performance.get(key)??[]),mean]);}}
 const performanceDecline=[...performance.values()].some(values=>values.length>=2&&values.at(-1)!<values[0]);
 const intakeKnown=reported.size===14&&[...reported].every(day=>{const intake=summarizeIntake(selected,day);return intake.day_complete&&intake.pending_meals===0&&nutrientNames.every(name=>intake.nutrients[name].range!==null&&intake.nutrients[name].unknown_items===0);});
 const insufficient=change===null||waist.length<2||complete.size<14||!intakeKnown||!performanceKnown||!recoveryKnown;
 const status=insufficient?'insufficient_data':flags||performanceDecline?'review':(change!==null&&change<0)||waist.at(-1)!.value<waist[0].value?'maintain':'review';
 const messages=insufficient?['資料不足：兩個固定七日視窗各需至少三個有效晨重日期，並補充腰圍、訓練表現、恢復與飲食完整度；不能確認停滯。']:flags||performanceDecline?[performanceDecline?'相同動作、重量模式與負荷的工作組平均表現下降，先檢視恢復與訓練，不继续減餐或加量。':'恢復或疼痛紀錄需先檢視，不繼續減餐或加量。']:status==='maintain'?['體重平均或腰圍緩慢下降，先維持並確認訓練表現與恢復。']:['先檢查份量、油、醬、飲料與實際執行；確認後才討論每日少約 100–150 kcal，不自動套用。'];
 return {date,current,previous,weight_points:weight,waist_points:waist,weight_change_kg:change,training_sessions:workouts.length,reported_days:reported.size,complete_days:complete.size,recovery_flags:flags,status,messages,suggestions:[{id:'review-next',title:insufficient?'補足回顧資料':status==='maintain'?'維持並繼續記錄':'確認後檢視方案',detail:messages[0],category:flags?'recovery':insufficient?'data':'training',requires_confirmation:status==='review'}]};
}
