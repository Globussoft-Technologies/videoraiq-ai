import { TriangleAlert, Flag, UserPlus, UserCheck, UserMinus } from 'lucide-react';
import { taggedUserName, formatPlate, hasReadablePlate } from '@/helpers/vehicleTagging';
import CameraCanvas from '../../Streams/CameraCanvas';
import { formatFromToTimestamps } from '@/utils/UtcConverter';
import { Checkbox } from '@/components/ui/checkbox';
import moment from 'moment';

const IncidentCard = ({
  item,
  onClick,
  onExpand,
  resolved,
  onMarkResolved,
  canEdit,
  onReport,
  onTagUser,
  onUntagUser,
  onViewUser,
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
          // Opens this incident's own detail lightbox instead of
          // CameraCanvas's default (a global stream-preview modal that's
          // only ever rendered on the Dashboard page — clicking maximize
          // here silently did nothing without this). Works in both normal
          // and delete mode, unlike the whole-card click.
          onMaximize={onExpand}
          // Top-right normally. In delete mode it takes the outermost
          // top-right spot, with the selection checkbox to its left, so the
          // pair reads left-to-right as [checkbox, expand].
          maxminBtnclass={
            deleteMode
              ? 'absolute top-1.5 md:top-2 2xl:top-2.5 right-1.5 md:right-1.5 2xl:right-2 z-10 bg-[#3f3f3f80] backdrop-blur-md text-white w-[20px] h-[20px] md:w-[22px] md:h-[22px] 2xl:w-[26px] 2xl:h-[26px] rounded-full flex justify-center items-center'
              : 'absolute top-1 md:top-1.5 2xl:top-2 right-1 md:right-1.5 2xl:right-2 bg-[#3f3f3f80] backdrop-blur-md text-white w-[20px] h-[20px] md:w-[22px] md:h-[22px] 2xl:w-[26px] 2xl:h-[26px] rounded-full flex justify-center items-center'
          }
          maxsize="text-xs md:text-sm 2xl:text-base"
          minsize="text-xs md:text-sm 2xl:text-base"
        />

        {deleteMode && (
          <div
            className="absolute top-1.5 md:top-2 2xl:top-2.5 right-9 md:right-10 2xl:right-11 z-10 flex items-center justify-center w-[26px] h-[26px] md:w-[28px] md:h-[28px] 2xl:w-[30px] 2xl:h-[30px]"
            onClick={(e) => e.stopPropagation()}
          >
            <Checkbox
              checked={selectedForDelete}
              onCheckedChange={() => onToggleDelete?.()}
              className="border-2 size-5 md:size-5.5 2xl:size-6 rounded-[6px] border-white bg-transparent shadow-md data-[state=checked]:bg-[#CE241C] data-[state=checked]:border-[#CE241C] data-[state=checked]:text-white cursor-pointer"
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
        {/* Plate + who it belongs to, for Vehicle Detection and the other
            plate-bearing detections. An untagged plate offers Tag User so an
            admin can link it to a registered user at any time. */}
        {hasReadablePlate(item.vehicleNumber) && (
          <div
            className="flex items-center gap-2 flex-wrap mb-1.5"
            onClick={(e) => e.stopPropagation()}
          >
            <span className="font-mono text-[10px] md:text-[11px] font-bold tracking-wide text-[#333333] bg-white border border-[#E4E4E4] px-2 py-0.5 rounded">
              {formatPlate(item.vehicleNumber)}
            </span>
            {item.taggedUser ? (
              <span className="flex items-center gap-1 text-[10px] md:text-[11px] text-[#333333] min-w-0">
                <UserCheck className="w-3 h-3 text-green-600 shrink-0" />
                {/* The name opens the registered user full details card
                    without leaving the Incident Center. */}
                {typeof onViewUser === 'function' ? (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onViewUser(item.taggedUser);
                    }}
                    className="truncate text-left underline decoration-dotted underline-offset-2 hover:text-[#07486A] cursor-pointer"
                    title={`View ${taggedUserName(item.taggedUser)}'s details`}
                  >
                    {taggedUserName(item.taggedUser)}
                  </button>
                ) : (
                  <span className="truncate">{taggedUserName(item.taggedUser)}</span>
                )}
                {canEdit && typeof onUntagUser === 'function' && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onUntagUser(item);
                    }}
                    className="shrink-0 flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded border border-[#E4E4E4] text-[#888] hover:text-[#CE241C] hover:border-[#CE241C] cursor-pointer transition-colors"
                    title={`Untag ${taggedUserName(item.taggedUser)} from this vehicle`}
                  >
                    <UserMinus className="w-3 h-3" />
                    Untag
                  </button>
                )}
              </span>
            ) : canEdit && typeof onTagUser === 'function' ? (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onTagUser(item);
                }}
                className="flex items-center gap-1 text-[10px] md:text-[11px] font-medium px-2 py-0.5 rounded border border-[#C7C7C7] text-[#07486A] hover:bg-[#E3F5FF] hover:border-[#07486A] cursor-pointer transition-colors"
                title="Tag this vehicle number to a registered user"
              >
                <UserPlus className="w-3 h-3" />
                Tag User
              </button>
            ) : (
              <span className="text-[10px] md:text-[11px] text-[#7A7A7A]">Not tagged</span>
            )}
          </div>
        )}
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