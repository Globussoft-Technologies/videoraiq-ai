import React from 'react';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const dotColors = {
  start: '#338904',
  pause: '#F5BE0B',
  stop: '#CE241C',
};

const styles = {
  label: "font-medium text-[#7A7A7A]",
  checkbox: "border-gray-300 cursor-pointer data-[state=checked]:bg-[#0B1A6A] data-[state=checked]:text-white",
  switch: "cursor-pointer",
  selectTrigger: "w-full h-8 bg-[#FAFAFA] border-[#C9C9C9] cursor-pointer",
  selectContent: "bg-[#FAFAFA] border-[#C9C9C9] min-w-[110px]",
  selectItem: "flex items-center gap-2 hover:bg-[#EEEEEE] cursor-pointer",
  button: "w-full cursor-pointer bg-[#F0F3FF] text-[#0B1A6A] border-[#DBDBDB] text-sm",
  statusBadge: (status) => `px-2 py-1 rounded-lg text-xs ${
    status === 'Approved'
      ? 'text-[#338904] bg-[#E8FFDB]'
      : 'text-[#CE241C] bg-[#FFDBD9]'
  }`,
};

export function MobileTableView({ table }) {
  return (
    <div className="md:hidden space-y-3">
      {table.getRowModel().rows.map((row) => (
        <div
          key={row.id}
          className="bg-[#F5F5F5] p-4 rounded-lg shadow-sm"
        >
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="col-span-2">              <Checkbox
                defaultChecked={row.original.select}
                className={styles.checkbox}
              />
            </div>

            <span className={styles.label}>Camera</span>
            <span className="text-gray-800">{row.original.camera}</span>            <span className={styles.label}>Fire Detection</span>
            <span>
              <Switch defaultChecked={row.original.fireDetection} className={styles.switch} />
            </span>

            <span className={styles.label}>Unauthorized Access</span>
            <span>
              <Switch defaultChecked={row.original.unauthorizedAccess} className={styles.switch} />
            </span>

            <span className={styles.label}>Face Recognition</span>
            <span>
              <Switch defaultChecked={row.original.faceRecognition} className={styles.switch} />
            </span>

            <span className={styles.label}>Cashier Tracking</span>
            <span>
              <Switch defaultChecked={row.original.cashierZoneTracking} className={styles.switch} />
            </span>

            <span className={styles.label}>Status</span>
            <span>
              <span className={styles.statusBadge(row.original.status)}>
                {row.original.status}
              </span>
            </span>

            <span className={styles.label}>Control</span>
            <span className="w-full">
              <Select 
                value={row.original.control}
                onValueChange={(newValue) => {
                  row.original.control = newValue;
                  table.options.meta?.updateData?.(row.index, 'control', newValue);
                }}
              >
                <SelectTrigger className={styles.selectTrigger}>
                  <div className="flex items-center gap-2">
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{
                        backgroundColor: dotColors[row.original.control],
                      }}
                    />
                    <span className="capitalize">{row.original.control}</span>
                  </div>
                </SelectTrigger>
                <SelectContent className={styles.selectContent}>
                  <SelectItem
                    value="start"
                    className={styles.selectItem}
                  >
                    <span className="w-2 h-2 rounded-full bg-[#338904]" />
                    Start
                  </SelectItem>
                  <SelectItem
                    value="pause"
                    className={styles.selectItem}
                  >
                    <span className="w-2 h-2 rounded-full bg-[#F5BE0B]" />
                    Pause
                  </SelectItem>
                  <SelectItem
                    value="stop"
                    className={styles.selectItem}
                  >
                    <span className="w-2 h-2 rounded-full bg-[#CE241C]" />
                    Stop
                  </SelectItem>
                </SelectContent>
              </Select>
            </span>

            <div className="col-span-2 pt-2">
              <Button
                variant="outline"
                className={styles.button}
              >
                Apply to review
              </Button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
