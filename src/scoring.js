const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
export function scorePriority(input = {}, context = {}) {
  if (context.contactState === 'do_not_contact' || context.recoveryMode === 'blocked') return { score:0, band:'Do not contact', factors:[{ label:'Contact permission', delta:-100, detail:'Outreach blocked' }] };
  let score = 62; const factors = [];
  const permissionDelta = context.contactState === 'allowed' ? 4 : -6;
  score += permissionDelta; factors.push({ label:'Contact permission', delta:permissionDelta, detail:context.contactState === 'allowed' ? 'Explicitly allowed' : 'Not explicitly confirmed' });
  let ageDelta=0;if(input.quoteAgeDays<=3)ageDelta=12;else if(input.quoteAgeDays<=7)ageDelta=7;else if(input.quoteAgeDays<=14)ageDelta=2;else if(input.quoteAgeDays<=30)ageDelta=-8;else if(input.quoteAgeDays<=60)ageDelta=-20;else ageDelta=-34;
  score+=ageDelta;factors.push({label:'Quote age',delta:ageDelta,detail:`${input.quoteAgeDays} day${input.quoteAgeDays===1?'':'s'} old`});
  const contactAge=input.lastContactAgeDays;
  let contactDelta=-2,contactDetail='Not supplied';
  if(Number.isInteger(contactAge)){if(contactAge===0){contactDelta=-12;contactDetail='Contacted today';}else if(contactAge===1){contactDelta=-6;contactDetail='Contacted yesterday';}else if(contactAge<=5){contactDelta=4;contactDetail=`${contactAge} days ago`;}else if(contactAge<=10){contactDelta=2;contactDetail=`${contactAge} days ago`;}else{contactDelta=-2;contactDetail=`${contactAge} days ago`;}}
  score+=contactDelta;factors.push({label:'Contact recency',delta:contactDelta,detail:contactDetail});
  const engagementDelta=({positive:12,neutral:2,unresponsive:-2,negative:-8,lost:-28,unknown:0})[context.engagementState]??0;score+=engagementDelta;factors.push({label:'Engagement',delta:engagementDelta,detail:context.engagementState??'unknown'});
  const blockerDelta=({none:7,budget:-5,price:-6,timing:-3,competitor:-8,trust:-10,financing:-8,spouse_partner:-2,not_ready:-5,unknown:-4})[context.primaryBlocker]??0;score+=blockerDelta;factors.push({label:'Primary blocker',delta:blockerDelta,detail:(context.primaryBlocker??'unknown').replaceAll('_',' ')});
  if(input.quoteAmount>=10000&&context.recoveryMode!=='close_loop'&&context.recoveryMode!=='reactivation'){score+=3;factors.push({label:'Quote value',delta:3,detail:`$${Math.round(input.quoteAmount).toLocaleString()}`});}else factors.push({label:'Quote value',delta:0,detail:input.quoteAmount?`$${Math.round(input.quoteAmount).toLocaleString()}`:'Not supplied'});
  if(context.recoveryMode==='close_loop'||context.recoveryMode==='reactivation')score=Math.min(score,34);if(context.recoveryMode==='nurture')score=Math.min(score,54);
  score=clamp(Math.round(score),1,100);let band=score>=75?'Priority follow-up':score>=55?'Active recovery':score>=35?'Nurture / resolve blocker':'Reactivation / close loop';if(context.recoveryMode==='close_loop'||context.recoveryMode==='reactivation')band='Reactivation / close loop';if(context.recoveryMode==='nurture'&&score>=35)band='Nurture / resolve blocker';return{score,band,factors};
}
