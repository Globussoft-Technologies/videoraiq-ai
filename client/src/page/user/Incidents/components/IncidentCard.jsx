import { TriangleAlert, Flag } from 'lucide-react';
import CameraCanvas from '../../Streams/CameraCanvas';
import { formatFromToTimestamps } from '@/utils/UtcConverter';
import { Checkbox } from '@/components/ui/checkbox';
import moment from 'moment';

const IncidentCard = ({
  item,
  onClick,
  resolved,
  onMarkResolved,
  canEdit,
  onReport,
  deleteMode,
  selectedForDelete,
  onToggleDelete,
}) => {
  return (
    <div
      className={`rounded-[8px] md:rounded-[10px] 2xl:rounded-[14px] overflow-hidden bg-white shadow border cursor-pointer hover:shadow-lg transition-shadow ${
        deleteMode && selectedForDelete ? 'border-[#CE241C] ring-2 ring-[#CE241C]/40' : 'border-[#E4E4E4]'
      }`}
      onClick={onClick}
    >
      {/* Video + overlays */}
      <div className="relative">
        <CameraCanvas
          src={item.videoSrc}
          thumbnailSrc={item.thumbnailSrc}
          maxminBtnclass="absolute top-1 md:top-1.5 2xl:top-2 right-1 md:right-1.5 2xl:right-2 bg-[#3f3f3f80] backdrop-blur-md text-white w-[20px] h-[20px] md:w-[22px] md:h-[22px] 2xl:w-[26px] 2xl:h-[26px] rounded-full flex justify-center items-center"
          maxsize="text-xs md:text-sm 2xl:text-base"
          minsize="text-xs md:text-sm 2xl:text-base"
        />

        {deleteMode && (
          <div
            className={`absolute top-1.5 md:top-2 2xl:top-2.5 right-1.5 md:right-1.5 2xl:right-2 z-10 flex items-center justify-center rounded-[7px] border-2 w-[26px] h-[26px] md:w-[28px] md:h-[28px] 2xl:w-[30px] 2xl:h-[30px] shadow-md transition-colors ${
              selectedForDelete ? 'bg-[#CE241C] border-[#CE241C]' : 'bg-black/70 border-[#F5A623] hover:bg-black/85'
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <Checkbox
              checked={selectedForDelete}
              onCheckedChange={() => onToggleDelete?.()}
              className="border-2 size-4 md:size-4.5 2xl:size-5 rounded-[5px] border-white/70 bg-transparent data-[state=checked]:bg-[#CE241C] data-[state=checked]:border-white data-[state=checked]:text-white cursor-pointer"
            />
          </div>
        )}

        {/* Top left area - Zone and Mark as Resolved */}
        <div className="absolute top-1.5 md:top-2 2xl:top-2.5 left-1.5 md:left-1.5 2xl:left-2 flex items-center gap-2">
          {item?.zone && (
            <div className="bg-black/80 text-[#FFFFFF] text-[8px] md:text-[9px] 2xl:text-[10px] font-normal px-2 md:px-2.5 2xl:px-3 py-1 md:py-1.5 2xl:py-[6px] rounded-full">
              {item?.zone ?? ''}
            </div>
          )}
          
          {canEdit && (
            <div className="flex items-center bg-black/80 hover:bg-black rounded-full 2xl:py-1.5 2xl:px-3 py-1 px-2 space-x-2 transition-colors duration-200 cursor-pointer"
              onClick={e => e.stopPropagation()}
              role="group"
              aria-label="Incident actions">
              <Checkbox
                id={`resolved-${item.id}`}
                checked={resolved}
                onCheckedChange={onMarkResolved}
                className="border size-3 md:size-3 2xl:size-4 data-[state=checked]:bg-[#07486A] data-[state=checked]:text-white border-[#8D8D8D] cursor-pointer"
              />
              <label
                htmlFor={`resolved-${item.id}`}
                className="text-white 2xl:text-xs text-[11px] select-none max-[364px]:text-[8px] font-[400] cursor-pointer"
              >
                Mark as resolved
              </label>
            </div>
          )}
        </div>
        
        {/* Top right - Timestamp */}
        {/* <div className="absolute top-1 md:top-1.5 2xl:top-2 right-8 text-[8px] md:text-[10px] 2xl:text-[12px] font-medium text-[#FFFFFF] px-2 md:px-2.5 2xl:px-3 py-1 md:py-1.5 2xl:py-[5px] rounded-full">
          {item?.timeOfIncident
            ? moment(item?.timeOfIncident).format('DD-MM-YYYY HH:mm:ss')
            : ''}
        </div> */}

        {/* Bottom left - Title and Alert */}
        <div className="absolute bottom-1.5 md:bottom-1.5 2xl:bottom-2 left-1.5 right-1.5 md:left-1.5 md:right-1.5 2xl:left-2 2xl:right-2 flex justify-between items-center">
          <div className="text-[#FFFFFF] font-medium text-[11px] md:text-[12px] 2xl:text-[14px] px-1.5 md:px-1.5 2xl:px-2 py-0.5 md:py-0.5 2xl:py-1 rounded">
            {item.title.toUpperCase()}
          </div>
          <div className="flex gap-2 items-center">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onReport?.();
              }}
              className="flex rounded-[5px] md:rounded-[6px] 2xl:rounded-[7px] items-center gap-1 md:gap-1.5 2xl:gap-2 bg-[#4A90E2] hover:bg-[#357ABD] text-white text-[10px] md:text-[11px] 2xl:text-xs font-medium px-1.5 md:px-1.5 2xl:px-2 py-1 md:py-1 2xl:py-1.5 transition-colors"
              title="Report Incident"
            >
              <span>
                <Flag className="w-3 h-3 md:w-4 md:h-4 2xl:w-[18px] 2xl:h-[18px]" />
              </span>
              <span className="hidden sm:inline">{item.report?.status ? 'Reported' : 'Report'}</span>
            </button>
            {item.alert && (
              <div className="flex rounded-[5px] md:rounded-[6px] 2xl:rounded-[7px] items-center gap-1 md:gap-1.5 2xl:gap-2 bg-[#FFDBD9] text-[#CE241C] text-[10px] md:text-[11px] 2xl:text-xs font-medium px-1.5 md:px-1.5 2xl:px-2 py-1 md:py-1 2xl:py-1.5">
                <span>
                  <TriangleAlert className="md:w-4 md:h-4 2xl:w-[18px] 2xl:h-[18px]" />
                </span>
                <span>Alert</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Metadata block */}
      <div className="bg-[#F9F9F9] p-2.5 md:p-3 2xl:p-4">
        <div className="flex items-center justify-between mb-0.5 md:mb-0.5 2xl:mb-1">
          <p className="text-[10px] md:text-[11px] 2xl:text-xs text-[#7A7A7A] font-normal">
            {/* {item?.incidentType ?? ''} */}
          </p>
        </div>
        <div className="flex items-center justify-between">
          <p className="text-[#333333] font-normal text-[10px] md:text-xs 2xl:text-[14px]">
            {formatFromToTimestamps(item.alertText)}
          </p>
        </div>
      </div>
    </div>
  );
};

export default IncidentCard;