import mongoose from "mongoose";
import Employee from "../../v1/authorizedUsers/authorizedUsers.model.js";
import Department from "../../v1/departments/departments.model.js";
import Shift from "../../v1/shifts/shifts.model.js";

const uniqueIds = (ids) => [...new Set(ids.filter(mongoose.isObjectIdOrHexString).map(String))];

export async function attachLateArrivalDetails(incidents, adminId) {
  if (!adminId) return;
  const lateArrivals = incidents.filter(({ incidentType }) => incidentType === "lateArrival");
  if (!lateArrivals.length) return;

  const employeeIds = uniqueIds(lateArrivals.filter((item) => item.departmentId === undefined).map((item) => item.employee));
  const shiftIds = uniqueIds(lateArrivals.filter((item) => !item.shiftName).map((item) => item.shiftId));
  const [employees, shifts] = await Promise.all([
    employeeIds.length ? Employee.find({ adminId, _id: { $in: employeeIds } }).select("departmentId").lean() : [],
    shiftIds.length ? Shift.find({ adminId, _id: { $in: shiftIds } }).select("name").lean() : [],
  ]);
  const departmentByEmployee = new Map(employees.map(({ _id, departmentId }) => [String(_id), departmentId]));
  const shiftNames = new Map(shifts.map(({ _id, name }) => [String(_id), name]));
  // Legacy incidents reference the employee, while newer incidents record the department at check-in.
  const departmentIdFor = (item) => item.departmentId === undefined
    ? departmentByEmployee.get(String(item.employee))
    : item.departmentId;
  const departmentIds = uniqueIds(lateArrivals.map(departmentIdFor));
  const departments = departmentIds.length
    ? await Department.find({ adminId, _id: { $in: departmentIds } }).select("departmentName").lean()
    : [];
  const departmentNames = new Map(departments.map(({ _id, departmentName }) => [String(_id), departmentName]));

  for (const item of lateArrivals) {
    item.departmentName = departmentNames.get(String(departmentIdFor(item))) ?? null;
    item.shiftName = item.shiftName || shiftNames.get(String(item.shiftId)) || null;
  }
}
