import { describe, it, expect, vi } from 'vitest';
vi.mock('../../../core/v1/attendance/attendance.model.js', () => ({default:{}}));
vi.mock('../../../core/v1/shifts/shiftSchedule.model.js', () => ({default:{}}));
vi.mock('../../../core/v1/incidents/incidents.model.js', () => ({Incident:{discriminators:{lateArrival:{}}}}));
vi.mock('../../../socket.js', () => ({sendPayloadToUser:vi.fn()}));
vi.mock('../../../mailService/mail.helper.js', () => ({default:{}}));
vi.mock('../../../utils/logger.js', () => ({default:{error:vi.fn()}}));
import { arrivalExpectation } from '../../../services/lateArrivalAlert.service.js';
const shift={startTime:'09:00',endTime:'18:00',graceLateMinutes:15};
const assess=(time,extra={})=>arrivalExpectation({shift,date:'2026-10-23',timezone:'Asia/Kolkata',arrivedAt:new Date(`2026-10-23T${time}+05:30`),...extra});
describe('late arrival assessment',()=>{
 it('allows exact grace deadline',()=>expect(assess('09:15:00').isLate).toBe(false));
 it('flags one second after deadline',()=>expect(assess('09:15:01')).toMatchObject({isLate:true,lateMinutes:1}));
 it('flags first arrival at midday',()=>expect(assess('12:00:00').lateMinutes).toBe(165));
 it('skips missing and inactive shifts and days off',()=>{
 expect(assess('12:00:00',{shift:null})).toBeNull();
 expect(assess('12:00:00',{shift:{...shift,isActive:false}})).toBeNull();
 expect(assess('12:00:00',{override:{isOff:true}})).toBeNull();
 });
 it('respects weekday start overrides',()=>expect(assess('10:15:00',{shift:{...shift,workingDays:{friday:{type:'half',start:'10:00'}}}}).isLate).toBe(false));
 it('handles overnight arrivals after midnight',()=>expect(arrivalExpectation({shift:{...shift,startTime:'22:00',endTime:'06:00'},date:'2026-10-22',timezone:'Asia/Kolkata',arrivedAt:new Date('2026-10-23T00:30:00+05:30')})).toMatchObject({isLate:true,lateMinutes:135}));
});

// Exercise event selection and the atomic incident insert, not just clock arithmetic.
import Attendance from '../../../core/v1/attendance/attendance.model.js';
import Schedule from '../../../core/v1/shifts/shiftSchedule.model.js';
import Shift from '../../../core/v1/shifts/shifts.model.js';
import { Incident } from '../../../core/v1/incidents/incidents.model.js';
import { sendPayloadToUser } from '../../../socket.js';
import { processLateArrival } from '../../../services/lateArrivalAlert.service.js';
it('ignores lunch returns and deduplicates notifications across API calls', async()=>{
 const event={cameraType:'checkin',timestamp:new Date('2026-10-23T12:00:00+05:30')};
 const args=()=>({attendance:{_id:'row'},employee:{_id:'employee',shiftId:'shift'},admin:{_id:'admin',user_id:'1',timezone:'Asia/Kolkata'},channel:{},event});
 Schedule.find=vi.fn(()=>({lean:async()=>[]}));
 vi.spyOn(Shift,'find').mockReturnValue({lean:async()=>[{...shift,_id:'shift'}]});
 Attendance.updateOne=vi.fn().mockResolvedValue({});
 Attendance.find=vi.fn(()=>({select:()=>({lean:async()=>[{events:[event,{...event,timestamp:new Date('2026-10-23T09:00:00+05:30')}]}]})}));
 Incident.discriminators.lateArrival.updateOne=vi.fn().mockResolvedValue({upsertedCount:1});
 await processLateArrival(args());
 expect(Incident.discriminators.lateArrival.updateOne).not.toHaveBeenCalled();
 Attendance.find.mockReturnValue({select:()=>({lean:async()=>[{events:[event]}]})});
 await processLateArrival(args());
 expect(sendPayloadToUser).toHaveBeenCalledTimes(1);
 const id=String(Incident.discriminators.lateArrival.updateOne.mock.calls[0][0]._id);
 Incident.discriminators.lateArrival.updateOne.mockResolvedValue({upsertedCount:0});
 await processLateArrival(args());
 expect(String(Incident.discriminators.lateArrival.updateOne.mock.calls[1][0]._id)).toBe(id);
 expect(sendPayloadToUser).toHaveBeenCalledTimes(1);
});
