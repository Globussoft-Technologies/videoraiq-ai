import * as yup from 'yup';

export const addRoleSchema = yup.object().shape({
    roles: yup
        .string()
        .required('Role Name is required')
        .min(3, 'Role Name must be at least 3 characters')
        .max(32, 'Role Name cannot exceed 32 characters'),
});
