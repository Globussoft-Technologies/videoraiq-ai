import { Info } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/Tooltip';

const GoogledriveForm = ({ values, errors, touched, handleChange, handleBlur, isEditMode }) => {
  return (
           <>
                      <div>
                        <label className="block ml-2 text-xs 2xl:text-sm font-[400] text-[#333333] mb-2">
                          <span className="inline-flex items-center">
                            Client ID
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
                                  Google OAuth Client ID from google cloud
                                  console
                                </span>
                              </TooltipContent>
                            </Tooltip>
                          </span>
                        </label>
                        <input
                          type="text"
                          name="clientId"
                          value={values.clientId}
                          onChange={handleChange}
                          onBlur={handleBlur}
                          className="w-full px-3 py-2 border border-[#80808059] rounded-[10px] text-sm focus:outline-none focus:ring-2 focus:ring-[#07486A] focus:border-transparent"
                          placeholder="Client ID"
                        />
                        {errors.clientId && touched.clientId && (
                          <div className="text-red-500 text-xs mt-1">
                            {errors.clientId}
                          </div>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block ml-2 text-xs 2xl:text-sm font-[400] text-[#333333] mb-2">
                            <span className="inline-flex items-center">
                              Client Secret
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
                                    Google OAuth Client Secret from google cloud
                                    console
                                  </span>
                                </TooltipContent>
                              </Tooltip>
                            </span>
                          </label>
                          <input
                            type="password"
                            name="clientSecret"
                            value={values.clientSecret}
                            onChange={handleChange}
                            onBlur={handleBlur}
                            className="w-full px-3 py-2 border border-[#80808059] rounded-[10px] text-sm focus:outline-none focus:ring-2 focus:ring-[#07486A] focus:border-transparent"
                            placeholder={
                              isEditMode
                                ? 'Leave blank to keep current'
                                : 'Client Secret'
                            }
                          />
                          {errors.clientSecret && touched.clientSecret && (
                            <div className="text-red-500 text-xs mt-1">
                              {errors.clientSecret}
                            </div>
                          )}
                        </div>

                        <div>
                          <label className="block ml-2 text-xs 2xl:text-sm font-[400] text-[#333333] mb-2">
                            <span className="inline-flex items-center">
                              Redirect URI
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
                                    Authorized redirect URI configured in google
                                    cloud console
                                  </span>
                                </TooltipContent>
                              </Tooltip>
                            </span>
                          </label>
                          <input
                            type="text"
                            name="redirectUri"
                            value={values.redirectUri}
                            onChange={handleChange}
                            onBlur={handleBlur}
                            className="w-full px-3 py-2 border border-[#80808059] rounded-[10px] text-sm focus:outline-none focus:ring-2 focus:ring-[#07486A] focus:border-transparent"
                            placeholder="Redirect URI"
                          />
                          {errors.redirectUri && touched.redirectUri && (
                            <div className="text-red-500 text-xs mt-1">
                              {errors.redirectUri}
                            </div>
                          )}
                        </div>
                      </div>
                    </>
  );
};

export default GoogledriveForm;