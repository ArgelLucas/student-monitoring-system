import {supabase} from './supabase.js';
import {rpc} from './api.js';

const ensure=(data,error)=>{
  if(error)throw new Error(error.message||'Attendance calendar request failed');
  return data;
};
const isMissingSchema=error=>Boolean(error&&(
  ['42P01','PGRST205','PGRST200'].includes(error.code)||
  /attendance_session_reviews.*(does not exist|could not find|not found)|relation.*attendance_session_reviews.*does not exist/i.test(error.message||'')
));

// Reviews belong to existing attendance windows. No future or phantom
// attendance session is created simply by selecting a calendar date.
export async function loadMonthSessionReviews(windows=[],month=''){
  const probe=await supabase.from('attendance_session_reviews')
    .select('window_id,status').limit(1);
  if(probe.error){
    if(isMissingSchema(probe.error))return {installed:false,reviews:{}};
    throw new Error(probe.error.message);
  }
  const ids=windows.filter(w=>w.meeting_date?.startsWith(month)).map(w=>w.id);
  const out={};
  for(let i=0;i<ids.length;i+=100){
    const result=await supabase.from('attendance_session_reviews')
      .select('window_id,status,finalized_at,finalization_note,cancelled_at,cancellation_reason')
      .in('window_id',ids.slice(i,i+100));
    for(const review of ensure(result.data,result.error))out[review.window_id]=review;
  }
  return {installed:true,reviews:out};
}

export async function loadSessionRegister(windowId){
  if(!windowId)return {review:null,entries:[]};
  const first=await supabase.from('attendance_session_reviews')
    .select('window_id,status,finalized_at,finalization_note,cancelled_at,cancellation_reason')
    .eq('window_id',windowId).maybeSingle();
  const review=ensure(first.data,first.error);
  if(!review)return {review:null,entries:[]};
  const entries=[];
  for(let offset=0;offset<=10000;offset+=500){
    const result=await supabase.from('attendance_register_entries')
      .select('window_id,student_number,student_name_snapshot,section_id_snapshot,linked_user_id,recorded_status,remarks,corrected_at')
      .eq('window_id',windowId)
      .order('student_name_snapshot')
      .range(offset,offset+499);
    const page=ensure(result.data,result.error);
    entries.push(...page);
    if(page.length<500)return {review,entries};
  }
  throw new Error('Attendance register exceeds 10,000 rows. Use server-side paging.');
}
export const prepareHistoricalRegister=(id)=>rpc('admin_prepare_attendance_register',{p_window_id:Number(id)});
export const correctAttendanceStatus=(id,studentNumber,status,reason)=>
  rpc('admin_set_attendance_status',{
    p_window_id:Number(id),p_student_number:String(studentNumber),
    p_status:status,p_reason:reason
  });
export const finalizeAttendanceSession=(id,markAbsent,reason)=>
  rpc('admin_finalize_attendance_session',{
    p_window_id:Number(id),p_mark_absent:Boolean(markAbsent),p_reason:reason
  });
export const cancelAttendanceSession=(id,reason)=>
  rpc('admin_cancel_attendance_session',{p_window_id:Number(id),p_reason:reason});
