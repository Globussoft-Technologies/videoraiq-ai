import React from 'react';
import { useFormikContext } from 'formik';
import { Upload, Camera, X } from 'lucide-react';
import { toast } from 'sonner';

const RegisterFormStep2 = ({
  uploadedImagePaths, 
  uploadedImageUrls,
  onRemoveImage, 
  onUploadFile, 
  onOpenCamera,
}) => {
  const { values } = useFormikContext();
  const uploadDomain = import.meta.env.VITE_BACKEND + '/api/v1/uploads';

      const org_id=import.meta.env.VITE_ORGANISATION_ID;

  return (
    <div className="space-y-3 sm:space-y-6">
     <p className="text-sm text-gray-500 font-medium">
  Uploaded {uploadedImagePaths.filter(img => img && (typeof img === 'string' ? img.trim() !== "" : true)).length} / {org_id == 'dubai' ? 1 : 3} images*
</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 sm:gap-6">
        {(org_id === 'dubai' ? ['Front'] : ['Front', 'Right', 'Left']).map((angle, index) => (
          <div key={angle} className="flex flex-col items-center gap-2 sm:gap-3">
            <div className={`w-full ${uploadedImagePaths[index] ? 'aspect-square sm:aspect-[4/5] max-h-[260px] sm:max-h-none' : 'sm:aspect-[4/5]'} bg-white rounded-2xl sm:border sm:border-gray-200 flex items-center justify-center p-0 sm:p-4 relative group sm:hover:shadow-md transition-shadow`}>
              {uploadedImagePaths[index] ? (
                <>
                  <img 
                    src={uploadedImageUrls[index] || `${uploadDomain}${uploadedImagePaths[index]}`}
                    alt={angle} 
                    className="w-full h-full object-contain rounded-xl"
                  />
                  <button
                    type="button"
                    onClick={() => onRemoveImage(index)}
                    className="absolute top-2 right-2 bg-red-500 text-white p-1.5 rounded-full cursor-pointer opacity-100 transition-opacity shadow-sm"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </>
              ) : (
                <div className="flex flex-col items-center gap-2 sm:gap-3 w-full">
                  <label className="w-full cursor-pointer">
                    <input
                      type="file"
                       accept="image/jpeg, image/png"
                      className="hidden"
                     onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (!file) return;

                              const validTypes = ['image/jpeg', 'image/png'];
                              if (!validTypes.includes(file.type)) {
                                toast.error('Please upload only JPG or PNG images.');
                                e.target.value = '';
                                return;
                              }

                              onUploadFile(file, values.firstName.trim(), index);
                            }}
                    />
                    <div className="flex items-center justify-center gap-2 w-full py-2 sm:py-3 px-3 bg-[#E3F5FF] text-[#07486A] rounded-lg text-sm font-medium hover:bg-[#d0ebfd] transition-colors">
                      <Upload className="w-4 h-4" />
                      Click From Files
                    </div>
                  </label>
                  <button
                    type="button"
                    onClick={() => onOpenCamera(angle)}
                    className="flex items-center justify-center gap-2 w-full py-2 sm:py-3 bg-[#F5F5F5] text-[#595959] rounded-lg text-sm font-medium hover:bg-[#e5e5e5] transition-colors"
                  >
                    <Camera className="w-4 h-4" />
                    Take Photo
                  </button>
                </div>
              )}
            </div>
            <span className="font-medium text-gray-700 text-base">{angle}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default RegisterFormStep2;
