import React, { useState } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/Tooltip';
import { CheckCheck, X, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';

const LOG_SUB_KEYS = ['accessLogs', 'attendanceLogs', 'ANPRLogs', 'trackLogs', 'deskLogs', 'guardLogs'];
const LOG_SUB_LABELS = {
  accessLogs: 'Access Logs',
  attendanceLogs: 'Attendance Logs',
  ANPRLogs: 'ANPR Logs',
  // trackLogs: 'Track Logs',
  // deskLogs: 'Desk Logs',
  // guardLogs: 'Guard Logs',
};
const EMPTY_ACTIONS = { view: false, create: false, edit: false, delete: false };

const PermissionStep = ({ permissions, onChange, readOnly, roleData }) => {

  const safePermissions = permissions || {};
  const [expanded, setExpanded] = useState({});

  const updatePermission = (module, action, value) => {
    if (module === 'channels' && (action === 'create' || action === 'delete')) {
      return;
    }

    const existingModule = (safePermissions[module] && typeof safePermissions[module] === 'object')
      ? { ...safePermissions[module] }
      : {
        view: !!safePermissions[`${module}_view`],
        create: !!safePermissions[`${module}_create`],
        edit: !!safePermissions[`${module}_edit`],
        delete: !!safePermissions[`${module}_delete`],
      };

    const updatedModule = { ...existingModule, [action]: !!value };

    if ((action === 'create' || action === 'edit' || action === 'delete') && !!value) {
      updatedModule.view = true;
    }
    if (action === 'view' && !value) {
      updatedModule.create = false;
      updatedModule.edit = false;
      updatedModule.delete = false;
    }


    onChange({ ...safePermissions, [module]: updatedModule });
  };

  const getPermissionValue = (module, action) => {
    if (safePermissions?.[module] && typeof safePermissions[module] === 'object' && safePermissions[module][action] !== undefined) {
      return !!safePermissions[module][action];
    }

    if (roleData?.permissionDetails?.permissionConfig?.[module]?.[action] !== undefined) {
      return !!roleData.permissionDetails.permissionConfig[module][action];
    }

    if (safePermissions[`${module}_${action}`] !== undefined) {
      return !!safePermissions[`${module}_${action}`];
    }

    return false;
  };

  // ---- Logs-specific helpers ----
  // Logs uses a nested shape: { global: {...}, accessLogs: {...}, attendanceLogs: {...}, ... }
  // where each sub-object is { view, create, edit, delete }.

  const getLogsSubValue = (subKey, action) => {
    const logs = safePermissions?.logs;
    if (logs && typeof logs === 'object') {
      const sub = logs[subKey];
      if (sub && typeof sub === 'object' && sub[action] !== undefined) {
        return !!sub[action];
      }
    }
    const rdLogs = roleData?.permissionDetails?.permissionConfig?.logs;
    if (rdLogs && typeof rdLogs === 'object') {
      const sub = rdLogs[subKey];
      if (sub && typeof sub === 'object' && sub[action] !== undefined) {
        return !!sub[action];
      }
    }
    return false;
  };

  // Apply the same view/CRD constraints used for flat modules.
  const applyActionToSub = (sub, action, value) => {
    const next = { ...sub, [action]: !!value };
    if ((action === 'create' || action === 'edit' || action === 'delete') && !!value) {
      next.view = true;
    }
    if (action === 'view' && !value) {
      next.create = false;
      next.edit = false;
      next.delete = false;
    }
    return next;
  };

  const updateLogsSubPermission = (subKey, action, value) => {
    const prevLogs = (safePermissions?.logs && typeof safePermissions.logs === 'object')
      ? safePermissions.logs
      : {};
    const nextLogs = { ...prevLogs };

    const existingSub = (nextLogs[subKey] && typeof nextLogs[subKey] === 'object')
      ? nextLogs[subKey]
      : { ...EMPTY_ACTIONS };

    nextLogs[subKey] = applyActionToSub(existingSub, action, value);

    if (subKey === 'global') {
      // Toggling the global row cascades the same action to every sub-section.
      LOG_SUB_KEYS.forEach((k) => {
        const existingChild = (nextLogs[k] && typeof nextLogs[k] === 'object')
          ? nextLogs[k]
          : { ...EMPTY_ACTIONS };
        nextLogs[k] = applyActionToSub(existingChild, action, value);
      });
    } else {
      // A child changed: recompute global as an OR of children — each action
      // is true if ANY child has it enabled, and only flips off when EVERY
      // child has it disabled.
      const nextGlobal = { ...EMPTY_ACTIONS };
      ['view', 'create', 'edit', 'delete'].forEach((act) => {
        nextGlobal[act] = LOG_SUB_KEYS.some(
          (k) => !!(nextLogs[k] && nextLogs[k][act])
        );
      });
      nextLogs.global = nextGlobal;
    }

    onChange({ ...safePermissions, logs: nextLogs });
  };

  const handleSelectAll = () => {
    if (readOnly) return;

    const configKeys = Object.keys(roleData?.permissionDetails?.permissionConfig || {});
    const editedKeys = Object.keys(safePermissions || {}).filter(k => typeof safePermissions[k] === 'object');
    const modules = Array.from(new Set([...configKeys, ...editedKeys]));

    const trueAll = { view: true, create: true, edit: true, delete: true };

    const allSelected = {};
    modules
      .filter((key) => key && (typeof roleData?.permissionDetails?.permissionConfig?.[key] === 'object' || typeof safePermissions?.[key] === 'object'))
      .forEach((module) => {
        if (module === 'logs') {
          allSelected[module] = {
            global: { ...trueAll },
            ...LOG_SUB_KEYS.reduce((acc, k) => {
              acc[k] = { ...trueAll };
              return acc;
            }, {}),
          };
        } else {
          allSelected[module] = {
            view: true,
            create: module === 'channels' ? false : true,
            edit: true,
            delete: module === 'channels' ? false : true,
          };
        }
      });

    onChange(allSelected);
  };

  const handleClearAll = () => {
    if (readOnly) return;

    const configKeys = Object.keys(roleData?.permissionDetails?.permissionConfig || {});
    const editedKeys = Object.keys(safePermissions || {}).filter(k => typeof safePermissions[k] === 'object');
    const modules = Array.from(new Set([...configKeys, ...editedKeys]));

    const allCleared = {};
    modules
      .filter((key) => key && (typeof roleData?.permissionDetails?.permissionConfig?.[key] === 'object' || typeof safePermissions?.[key] === 'object'))
      .forEach((module) => {
        if (module === 'logs') {
          allCleared[module] = {
            global: { ...EMPTY_ACTIONS },
            ...LOG_SUB_KEYS.reduce((acc, k) => {
              acc[k] = { ...EMPTY_ACTIONS };
              return acc;
            }, {}),
          };
        } else {
          allCleared[module] = { ...EMPTY_ACTIONS };
        }
      });

    onChange(allCleared);
  };

  const styles = {
    text: 'text-[#333333] text-sm font-normal',
    header: 'text-[#333333] text-sm font-medium',
  };

  const renderCheckboxCell = (checked, disabled, onToggle) => (
    <Checkbox
      checked={checked}
      onCheckedChange={(v) => !disabled && onToggle(v)}
      disabled={disabled}
      className="border-[#777777] data-[state=checked]:bg-[#07486A] size-5 cursor-pointer data-[state=checked]:text-white"
    />
  );

  return (
    <div className="space-y-2">
      {/* Select All / Clear All Buttons */}
      {!readOnly && (
        <div className="flex justify-end gap-2 mb-3">
          <Button
            type="button"
            onClick={handleSelectAll}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-[#07486A] text-white hover:bg-[#07486A]/90 rounded-md"
          >
            <CheckCheck className="w-4 h-4" />
            <span>Select All</span>
          </Button>
          <Button
            type="button"
            onClick={handleClearAll}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-[#E6E6E6] text-[#333333] hover:bg-[#D1D1D1] rounded-md"
          >
            <X className="w-4 h-4" />
            <span>Clear All</span>
          </Button>
        </div>
      )}

      {/* Header */}
      <div className={`w-full bg-[#F7F7F7] rounded-t-md grid grid-cols-5 py-3 px-4 items-center ${styles.header}`}>
        <div>Access</div>
        <div className="text-center">View</div>
        <div className="text-center">Create</div>
        <div className="text-center">Edit</div>
        <div className="text-center">Delete</div>
      </div>

      {/* Rows */}
      <div className="space-y-2">
        {(() => {
          const configKeys = Object.keys(roleData?.permissionDetails?.permissionConfig || {});
          const editedKeys = Object.keys(safePermissions || {}).filter(k => typeof safePermissions[k] === 'object');
          const modules = Array.from(new Set([...configKeys, ...editedKeys]));

          return modules
            .filter((key) => key && (typeof roleData?.permissionDetails?.permissionConfig?.[key] === 'object' || typeof safePermissions?.[key] === 'object'))
            .map((key) => {
              const label = key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, ' $1');
              return { key, label };
            })
            .map((row) => {
              if (row.key === 'logs') {
                const isOpen = !!expanded.logs;
                const globalViewEnabled = getLogsSubValue('global', 'view');

                return (
                  <React.Fragment key={row.key}>
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => setExpanded((prev) => ({ ...prev, logs: !prev.logs }))}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setExpanded((prev) => ({ ...prev, logs: !prev.logs }));
                        }
                      }}
                      className="grid grid-cols-5 items-center bg-[#F5F5F5] py-4 px-4 rounded-md border border-transparent hover:border-[#eeeeee] cursor-pointer select-none"
                    >
                      <div className="font-[600] 2xl:text-sm whitespace-nowrap text-xs text-[#333333] flex items-center gap-2">
                        <ChevronDown
                          className={`w-4 h-4 transition-transform ${isOpen ? '' : '-rotate-90'}`}
                        />
                        <span>{row.label}</span>
                      </div>
                      {['view', 'create', 'edit', 'delete'].map((perm) => {
                        const checkedValue = getLogsSubValue('global', perm);
                        const isDisabled = readOnly || (perm !== 'view' && !globalViewEnabled);
                        return (
                          <div
                            key={perm}
                            className="flex justify-center"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {renderCheckboxCell(checkedValue, isDisabled, (v) =>
                              updateLogsSubPermission('global', perm, v)
                            )}
                          </div>
                        );
                      })}
                    </div>

                {isOpen &&
                LOG_SUB_KEYS
                  .filter((subKey) => LOG_SUB_LABELS[subKey]) // 👈 only render if label exists
                  .map((subKey) => {
                        const subViewEnabled = getLogsSubValue(subKey, 'view');
                        return (
                          <div
                            key={subKey}
                            className="grid grid-cols-5 items-center bg-white py-3 px-4 rounded-md border border-[#eeeeee] ml-6"
                          >
                            <div className="2xl:text-sm whitespace-nowrap text-xs text-[#555555] pl-2">
                              {LOG_SUB_LABELS[subKey]}
                            </div>
                            {['view', 'create', 'edit', 'delete'].map((perm) => {
                              const checkedValue = getLogsSubValue(subKey, perm);
                              const isDisabled = readOnly || (perm !== 'view' && !subViewEnabled);
                              return (
                                <div key={perm} className="flex justify-center">
                                  {renderCheckboxCell(checkedValue, isDisabled, (v) =>
                                    updateLogsSubPermission(subKey, perm, v)
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        );
                      })}
                  </React.Fragment>
                );
              }

              return (
                <div
                  key={row.key}
                  className="grid grid-cols-5 items-center bg-[#F5F5F5] py-4 px-4 rounded-md  border border-transparent hover:border-[#eeeeee]"
                >
                  <div className="font-[600] 2xl:text-sm whitespace-nowrap text-xs text-[#333333]">{row.label}</div>

                  {/* Render checkbox-like switches centered inside a teal square when checked. */}
                  {['view', 'create', 'edit', 'delete'].map((perm) => {

                    const isChannelsCreateOrDelete = row.key === 'channels' && (perm === 'create' || perm === 'delete');
                    const viewEnabled = getPermissionValue(row.key, 'view');
                    const isDisabled = readOnly || isChannelsCreateOrDelete || (perm !== 'view' && !viewEnabled);
                    const checkedValue = isChannelsCreateOrDelete ? false : getPermissionValue(row.key, perm);
                    return (
                      <div key={perm} className="flex justify-center">
                        {isChannelsCreateOrDelete ? (
                          <Tooltip>
                            <TooltipTrigger>
                              <div>
                                <Checkbox
                                  checked={checkedValue}
                                  onCheckedChange={(v) => !isDisabled && updatePermission(row.key, perm, v)}
                                  disabled={isDisabled}
                                  className="border-[#777777] data-[state=checked]:bg-[#07486A] size-5 cursor-pointer data-[state=checked]:text-white"
                                />
                              </div>
                            </TooltipTrigger>
                            <TooltipContent>
                              Not in use
                            </TooltipContent>
                          </Tooltip>
                        ) : (
                          <Checkbox
                            checked={checkedValue}
                            onCheckedChange={(v) => !isDisabled && updatePermission(row.key, perm, v)}
                            disabled={isDisabled}
                            className="border-[#777777] data-[state=checked]:bg-[#07486A] size-5 cursor-pointer data-[state=checked]:text-white"
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })
        })()}
      </div>

      {/* Send Email and Footer */}
      {/* <div className="pt-4">
        <div className="flex flex-col items-start gap-2 mt-4 py-3 border-t border-[#D9D9D9] ">
          <div className="text-sm text-[#7A7A7A]">Send Email</div>
          <Switch
            checked={!!(safePermissions.sendEmail ?? roleData?.sendEmail)}
            onCheckedChange={(v) => !readOnly && onChange({ ...safePermissions, sendEmail: !!v })}
            disabled={readOnly}
            className="data-[state=checked]:bg-[#07486A]"
          />
        </div>

        <div className="border-t border-[#D9D9D9]" />


      </div> */}
    </div>
  );
};

export default PermissionStep;
