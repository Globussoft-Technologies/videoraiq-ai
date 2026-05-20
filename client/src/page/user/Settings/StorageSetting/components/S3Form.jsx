import { Info } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/Tooltip';

const S3Form = ({ values, errors, touched, handleChange, handleBlur, isEditMode }) => {
  return (
           <>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block ml-2 text-xs 2xl:text-sm font-[400] text-[#333333] mb-2">
                            <span className="inline-flex items-center">
                              Access Key ID
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button
                                    type="button"
                                    className="inline-flex items-center"
                                  >
                                    <Info className="2xl:h-4 2xl:w-4 w-3 h-3 ml-1 text-gray-400" />
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent
                                  className="bg-white text-black max-w-[150px] whitespace-normal break-words text-center"
                                  arrowClassName="bg-white fill-white"
                                >
                                  <span className="text-[#333333] font-[400] 2xl:text-xs text-[10px]">
                                    AWS Access Key ID from AWS Console
                                  </span>
                                </TooltipContent>
                              </Tooltip>
                            </span>
                          </label>
                          <input
                            type="password"
                            name="accessKeyId"
                            value={values.accessKeyId}
                            onChange={handleChange}
                            onBlur={handleBlur}
                            className="w-full px-3 py-2 border border-[#80808059] rounded-[10px] text-sm focus:outline-none focus:ring-2 focus:ring-[#07486A] focus:border-transparent"
                            placeholder={
                              isEditMode
                                ? 'Leave blank to keep current'
                                : 'Access Key ID'
                            }
                          />
                          {errors.accessKeyId && touched.accessKeyId && (
                            <div className="text-red-500 text-xs mt-1">
                              {errors.accessKeyId}
                            </div>
                          )}
                        </div>

                        <div>
                          <label className="block ml-2 text-xs 2xl:text-sm font-[400] text-[#333333] mb-2">
                            <span className="inline-flex items-center">
                              Secret Access Key
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button
                                    type="button"
                                    className="inline-flex items-center"
                                  >
                                    <Info className="2xl:h-4 2xl:w-4 w-3 h-3 ml-1 text-gray-400" />
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent
                                  className="bg-white text-black max-w-[150px] whitespace-normal break-words text-center"
                                  arrowClassName="bg-white fill-white"
                                >
                                  <span className="text-[#333333] font-[400] 2xl:text-xs text-[10px]">
                                    AWS Secret Access Key from AWS Console
                                  </span>
                                </TooltipContent>
                              </Tooltip>
                            </span>
                          </label>
                          <input
                            type="password"
                            name="secretAccessKey"
                            value={values.secretAccessKey}
                            onChange={handleChange}
                            onBlur={handleBlur}
                            className="w-full px-3 py-2 border border-[#80808059] rounded-[10px] text-sm focus:outline-none focus:ring-2 focus:ring-[#07486A] focus:border-transparent"
                            placeholder={
                              isEditMode
                                ? 'Leave blank to keep current'
                                : 'Secret Access Key'
                            }
                          />
                          {errors.secretAccessKey &&
                            touched.secretAccessKey && (
                              <div className="text-red-500 text-xs mt-1">
                                {errors.secretAccessKey}
                              </div>
                            )}
                        </div>
                      </div>

                      <div>
                        <label className="block ml-2 text-xs 2xl:text-sm font-[400] text-[#333333] mb-2">
                          <span className="inline-flex items-center">
                            Bucket Name
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  type="button"
                                  className="inline-flex items-center"
                                >
                                  <Info className="2xl:h-4 2xl:w-4 w-3 h-3 ml-1 text-gray-400" />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent
                                className="bg-white text-black max-w-[150px] whitespace-normal break-words text-center"
                                arrowClassName="bg-white fill-white"
                              >
                                <span className="text-[#333333] font-[400] 2xl:text-xs text-[10px]">
                                  Name of your S3 bucket
                                </span>
                              </TooltipContent>
                            </Tooltip>
                          </span>
                        </label>
                        <input
                          type="text"
                          name="bucketName"
                          value={values.bucketName}
                          onChange={handleChange}
                          onBlur={handleBlur}
                          className="w-full px-3 py-2 border border-[#80808059] rounded-[10px] text-sm focus:outline-none focus:ring-2 focus:ring-[#07486A] focus:border-transparent"
                          placeholder="Bucket Name"
                        />
                        {errors.bucketName && touched.bucketName && (
                          <div className="text-red-500 text-xs mt-1">
                            {errors.bucketName}
                          </div>
                        )}
                      </div>

                      <div>
                        <label className="block ml-2 text-xs 2xl:text-sm font-[400] text-[#333333] mb-2">
                          <span className="inline-flex items-center">
                            Region
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  type="button"
                                  className="inline-flex items-center"
                                >
                                  <Info className="2xl:h-4 2xl:w-4 w-3 h-3 ml-1 text-gray-400" />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent
                                className="bg-white text-black max-w-[150px] whitespace-normal break-words text-center"
                                arrowClassName="bg-white fill-white"
                              >
                                <span className="text-[#333333] font-[400] 2xl:text-xs text-[10px]">
                                  AWS Region of your S3 bucket
                                </span>
                              </TooltipContent>
                            </Tooltip>
                          </span>
                        </label>
                        <input
                          type="text"
                          name="region"
                          value={values.region}
                          onChange={handleChange}
                          onBlur={handleBlur}
                          className="w-full px-3 py-2 border border-[#80808059] rounded-[10px] text-sm focus:outline-none focus:ring-2 focus:ring-[#07486A] focus:border-transparent"
                          placeholder="Region (e.g., us-east-1)"
                        />
                        {errors.region && touched.region && (
                          <div className="text-red-500 text-xs mt-1">
                            {errors.region}
                          </div>
                        )}
                      </div>
                    </>
  );
};

export default S3Form;