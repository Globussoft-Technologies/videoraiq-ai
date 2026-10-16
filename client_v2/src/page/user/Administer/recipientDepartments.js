// A recipient's departments are labels (recipient.departmentIds, populated with
// names by recipients/fetch). They only help find people in a detection's
// Select Recipients; they never change which alerts they get.

export const NO_DEPARTMENT = 'none';

const idOf = (department) => String(department?._id ?? department ?? '');

/** [{ key, name }] for each of the recipient's departments, or "No department". */
const departmentsOf = (recipient) => {
  const list = (Array.isArray(recipient?.departmentIds) ? recipient.departmentIds : [])
    .filter(Boolean)
    .map((department) => ({ key: idOf(department), name: department?.departmentName || 'Department' }));
  return list.length ? list : [{ key: NO_DEPARTMENT, name: 'No department' }];
};

export const departmentKeys = (recipient) => departmentsOf(recipient).map((d) => d.key);

export const hasDepartments = (recipient) => departmentKeys(recipient)[0] !== NO_DEPARTMENT;

/** "Warehouse", or "Warehouse +2" when there are more. */
export const departmentLabel = (recipient) => {
  const names = departmentsOf(recipient).map((d) => d.name);
  return names.length > 1 ? `${names[0]} +${names.length - 1}` : names[0];
};

/** Every department name, for a tooltip. */
export const departmentTitle = (recipient) => departmentsOf(recipient).map((d) => d.name).join(', ');

/** Filter options: "No department" first, then every department these recipients belong to, by name. */
export const departmentsIn = (recipients) => {
  const byKey = new Map(recipients.flatMap(departmentsOf).map((d) => [d.key, d.name]));
  return [...byKey]
    .map(([key, name]) => ({ key, name }))
    .sort((a, b) => (b.key === NO_DEPARTMENT) - (a.key === NO_DEPARTMENT) || a.name.localeCompare(b.name));
};

/** In any of the filtered departments; an empty filter means every department. */
export const inDepartments = (recipient, filter) =>
  !filter.length || departmentKeys(recipient).some((key) => filter.includes(key));
