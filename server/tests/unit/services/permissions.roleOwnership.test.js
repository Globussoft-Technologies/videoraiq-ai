import { afterEach, describe, expect, it, vi } from 'vitest';
import { payload, serviceCtx } from '../../helpers/service.js';

const { default: v1Service } = await import('../../../core/v1/permission/permissions.utility.js');
const { default: v2Service } = await import('../../../core/v2/permission/permissions.utility.js');
const { default: v1RolesService } = await import('../../../core/v1/roles/roles.service.js');
const { default: v2RolesService } = await import('../../../core/v2/roles/roles.service.js');
const { default: v1Permission } = await import('../../../core/v1/permission/permissions.model.js');
const { default: v2Permission } = await import('../../../core/v2/permission/permissions.model.js');
const { default: v1User } = await import('../../../core/v1/authorizedUsers/authorizedUsers.model.js');
const { default: v2User } = await import('../../../core/v2/authorizedUsers/authorizedUsers.model.js');
const { default: v1Role } = await import('../../../core/v1/roles/roles.model.js');
const { default: v2Role } = await import('../../../core/v2/roles/roles.model.js');

afterEach(() => vi.restoreAllMocks());

describe.each([
  ['v1', v1Service, v1Permission, v1User, v1Role],
  ['v2', v2Service, v2Permission, v2User, v2Role],
])('%s role permission updates', (version, service, Permission, User, Role) => {
  const run = async ({ creator = 'someone-else', rolesEdit = false, assignedRole = 'assigned-role', targetRole = 'target-role', isDefault = false } = {}) => {
    const permission = { _id: 'target-permission', is_default: false, permissionConfig: { dashboard: { view: false } } };
    vi.spyOn(Permission, version === 'v1' ? 'findById' : 'findOne').mockResolvedValue(permission);
    vi.spyOn(User, 'findById').mockReturnValue({ select: vi.fn().mockResolvedValue({ roleIds: assignedRole }) });
    vi.spyOn(Role, 'findOne').mockReturnValue({ select: vi.fn().mockResolvedValue({ _id: targetRole, is_default: isDefault, createdBy: { userId: creator } }) });
    const update = vi.spyOn(Permission, 'findOneAndUpdate').mockResolvedValue({ _id: 'target-permission' });
    const { req, res } = serviceCtx({
      adminId: '000000000000000000000001',
      memberId: 'member-1',
      permissionConfig: [{ permissionConfig: { permission: { edit: true }, roles: { edit: rolesEdit } } }],
      query: { permissionId: 'target-permission' },
      body: { permissionConfig: { dashboard: { view: true } } },
    });
    await service.updatePermissions(req, res);
    return { res, update };
  };

  it('blocks another user’s role without roles.edit', async () => {
    const { res, update } = await run();
    expect(res.statusCode).toBe(400);
    expect(payload(res).status).toBe('failed');
    expect(update).not.toHaveBeenCalled();
  });

  it('blocks roles with no recorded creator when roles.edit is absent', async () => {
    const { res, update } = await run({ creator: null });
    expect(res.statusCode).toBe(400);
    expect(update).not.toHaveBeenCalled();
  });

  it('allows the role creator without roles.edit', async () => {
    const { res, update } = await run({ creator: 'member-1' });
    expect(payload(res).status).toBe('success');
    expect(update).toHaveBeenCalledOnce();
  });

  it('allows roles.edit on another non-default role', async () => {
    const { res, update } = await run({ rolesEdit: true });
    expect(payload(res).status).toBe('success');
    expect(update).toHaveBeenCalledOnce();
  });

  it('blocks changes to the assigned or default role', async () => {
    const own = await run({ creator: 'member-1', rolesEdit: true, assignedRole: 'target-role' });
    expect(own.res.statusCode).toBe(400);
    expect(own.update).not.toHaveBeenCalled();
    vi.restoreAllMocks();

    const defaultRole = await run({ creator: 'member-1', rolesEdit: true, isDefault: true });
    expect(defaultRole.res.statusCode).toBe(400);
    expect(defaultRole.update).not.toHaveBeenCalled();
  });
});

describe.each([
  ['v1', v1RolesService, v1Permission, v1Role],
  ['v2', v2RolesService, v2Permission, v2Role],
])('%s role creation', (_version, service, Permission, Role) => {
  it('records the member as creator in the role and its permission', async () => {
    vi.spyOn(Role, 'find').mockResolvedValue([]);
    const createRole = vi.spyOn(Role, 'create').mockResolvedValue({ _id: 'new-role' });
    const createPermission = vi.spyOn(Permission, 'create').mockResolvedValue({ _id: 'new-permission' });
    vi.spyOn(Role, 'findOneAndUpdate').mockResolvedValue({ _id: 'new-role' });
    const { req, res } = serviceCtx({
      adminId: '000000000000000000000001',
      memberId: 'member-1',
      body: { roles: ['newrole'] },
    });

    await service.createRoles(req, res);

    expect(payload(res).status).toBe('success');
    expect(createRole.mock.calls[0][0].createdBy.userId).toBe('member-1');
    expect(createPermission.mock.calls[0][0]['createdBy.userId']).toBe('member-1');
  });
});
