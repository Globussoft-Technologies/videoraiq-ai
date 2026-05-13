import { Info } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/Tooltip';

const SftpForm = ({ values, errors, touched, handleChange, handleBlur, isEditMode }) => {
  return (
    <>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block ml-2 text-xs 2xl:text-sm font-[400] text-[#333333] mb-2">
                            Username
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
                                  SFTP server name
                                </span>
                              </TooltipContent>
                            </Tooltip>
                          </label>
                          <input
                            type="text"
                            name="username"
                            value={values.username}
                            onChange={handleChange}
                            onBlur={handleBlur}
                            placeholder="Username"
                            className="w-full px-3 py-2 border border-[#80808059] rounded-[10px] text-sm focus:outline-none focus:ring-2 focus:ring-[#07486A] focus:border-transparent"
                          />
                          {errors.username && touched.username && (
                            <div className="text-red-500 text-xs mt-1">
                              {errors.username}
                            </div>
                          )}
                        </div>
                        <div>
                          <label className="block ml-2 text-xs 2xl:text-sm font-[400] text-[#333333] mb-2">
                            <span className="inline-flex items-center">
                              Password
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
                                    SFTP authentication Password
                                  </span>
                                </TooltipContent>
                              </Tooltip>
                            </span>
                          </label>
                          <input
                            type="password"
                            name="password"
                            value={values.password}
                            onChange={handleChange}
                            onBlur={handleBlur}
                            placeholder={isEditMode ? 'Password' : 'Password'}
                            className="w-full px-3 py-2 border border-[#80808059] rounded-[10px] text-sm focus:outline-none focus:ring-2 focus:ring-[#07486A] focus:border-transparent"
                          />
                          {errors.password && touched.password && (
                            <div className="text-red-500 text-xs mt-1">
                              {errors.password}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block ml-2 text-xs 2xl:text-sm font-[400] text-[#333333] mb-2">
                            <span className="inline-flex items-center">
                              Host
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
                                    IP Address
                                  </span>
                                </TooltipContent>
                              </Tooltip>
                            </span>
                          </label>
                          <input
                            type="text"
                            name="host"
                            value={values.host}
                            onChange={handleChange}
                            onBlur={handleBlur}
                            placeholder="Host"
                            className="w-full px-3 py-2 border border-[#80808059] rounded-[10px] text-sm focus:outline-none focus:ring-2 focus:ring-[#07486A] focus:border-transparent"
                          />
                          {errors.host && touched.host && (
                            <div className="text-red-500 text-xs mt-1">
                              {errors.host}
                            </div>
                          )}
                        </div>
                        <div>
                          <label className="block ml-2 text-xs 2xl:text-sm font-[400] text-[#333333] mb-2">
                            <span className="inline-flex items-center">
                              Port
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
                                    SFTP server port number
                                  </span>
                                </TooltipContent>
                              </Tooltip>
                            </span>
                          </label>
                          <input
                            type="number"
                            name="port"
                            value={values.port}
                            onChange={handleChange}
                            onBlur={handleBlur}
                            placeholder="Port"
                            className="w-full px-3 py-2 border border-[#80808059] rounded-[10px] text-sm focus:outline-none focus:ring-2 focus:ring-[#07486A] focus:border-transparent"
                          />
                          {errors.port && touched.port && (
                            <div className="text-red-500 text-xs mt-1">
                              {errors.port}
                            </div>
                          )}
                        </div>
                      </div>
                      <div>
                        <label className="block ml-2 text-xs 2xl:text-sm font-[400] text-[#333333] mb-2">
                          <span className="inline-flex items-center">
                            Path
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
                                  Remote directory path on SFTP server
                                </span>
                              </TooltipContent>
                            </Tooltip>
                          </span>
                        </label>
                        <input
                          type="text"
                          name="path"
                          value={values.path}
                          onChange={handleChange}
                          onBlur={handleBlur}
                          placeholder="Path"
                          className="w-full px-3 py-2 border border-[#80808059] rounded-[10px] text-sm focus:outline-none focus:ring-2 focus:ring-[#07486A] focus:border-transparent"
                        />
                        {errors.path && touched.path && (
                          <div className="text-red-500 text-xs mt-1">
                            {errors.path}
                          </div>
                        )}
                      </div>
                    </>
  );
};

export default SftpForm;