import { useFormikContext } from 'formik';
import { Upload, Camera, X, Check } from 'lucide-react';
import frontView from '@/assets/front_view.png';
import leftView from '@/assets/left_view.png';
import rightView from '@/assets/right_view.png';

const orgId = import.meta.env.VITE_ORGANISATION_ID;
const uploadDomain = `${import.meta.env.VITE_BACKEND}/uploads`;

const POSE_ART = { Front: frontView, Left: leftView, Right: rightView };

const RegisterFormStep2 = ({
  uploadedImagePaths,
  uploadedImageUrls,
  onRemoveImage,
  onOpenCamera,
}) => {
  const { values } = useFormikContext();
  const angles = orgId === 'dubai' ? ['Front'] : ['Front', 'Right', 'Left'];
  const requiredCount = orgId === 'dubai' ? 1 : 3;

  const isFilled = (img) => (typeof img === 'string' ? img.trim() !== '' : !!img);
  const uploadedCount = uploadedImagePaths.filter(isFilled).length;

  return (
    <div className="space-y-5">
      <p className="text-sm text-[var(--tx2)] font-medium">
        Added {uploadedCount} / {requiredCount} image{requiredCount > 1 ? 's' : ''}*
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        {angles.map((angle, index) => {
          const filled = isFilled(uploadedImagePaths[index]);
          const src =
            uploadedImageUrls[index] ||
            (typeof uploadedImagePaths[index] === 'string' && uploadedImagePaths[index]
              ? `${uploadDomain}${uploadedImagePaths[index]}`
              : '');

          return (
            <div
              key={angle}
              className={`relative flex flex-col rounded-2xl border overflow-hidden bg-[var(--bg2)] transition-colors ${
                filled ? 'border-[var(--ok)]/50' : 'border-[var(--bd)]'
              }`}
            >
              <div className="relative aspect-[4/3] w-full bg-[var(--bg3)] overflow-hidden">
                {filled ? (
                  <>
                    <img src={src} alt={angle} className="w-full h-full object-cover object-[center_25%]" />
                    <button
                      type="button"
                      onClick={() => onRemoveImage(index)}
                      className="absolute top-2 right-2 bg-[var(--crit)] text-white p-1.5 rounded-full cursor-pointer shadow-sm hover:opacity-90"
                      aria-label={`Remove ${angle} photo`}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </>
                ) : (
                  <img
                    src={POSE_ART[angle] || POSE_ART.Front}
                    alt={`${angle} reference pose`}
                    draggable={false}
                    className="absolute inset-0 w-full h-full object-cover object-[center_18%]"
                  />
                )}
                <span
                  className={`absolute top-2 left-2 inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold backdrop-blur-sm ${
                    filled ? 'bg-[var(--ok)] text-white' : 'bg-black/45 text-white'
                  }`}
                >
                  {filled && <Check className="w-3 h-3" strokeWidth={3} />}
                  {angle} view
                </span>
              </div>

              <div className="flex items-center gap-2 p-2.5 border-t border-[var(--bd)]">
                <button
                  type="button"
                  onClick={() => onOpenCamera(angle, values.firstName, 'camera')}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 h-9 rounded-lg bg-[var(--blue)] text-white text-[13px] font-medium hover:opacity-95 transition-opacity cursor-pointer"
                >
                  <Camera className="w-3.5 h-3.5" /> {filled ? 'Retake' : 'Take photo'}
                </button>
                <button
                  type="button"
                  onClick={() => onOpenCamera(angle, values.firstName, 'upload')}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 h-9 rounded-lg border border-[var(--bd)] bg-[var(--bg2)] text-[var(--tx2)] text-[13px] font-medium hover:bg-[var(--bg3)] transition-colors cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5" /> Upload
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default RegisterFormStep2;
