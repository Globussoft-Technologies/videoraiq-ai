// import React from 'react';
// import { Search } from 'lucide-react';
// import { Input } from '@/components/ui/input';
// import {
//   Select,
//   SelectTrigger,
//   SelectValue,
//   SelectContent,
//   SelectItem,
// } from '@/components/ui/select';

// const SearchControls = ({
//   searchInputValue,
//   handleSearchChange,
//   showSearchResults,
//   cameraSearchResults,
//   handleSelectSearchResult,
//   setShowSearchResults,
//   nvrOptions,
//   selectedNVRId,
//   setSelectedNVRId,
//   setSearchInputValue,
//   setCameraSearchResults,
//   cameraOptions,
//   selectedCameraId,
//   setSelectedCameraId,
//   isLoading
// }) => {
//   return (
//     <div className="flex flex-col md:flex-row items-start md:items-center gap-3 md:gap-3 my-1 px-2 py-3 md:py-4 rounded-lg">
//       <div className="relative w-full md:max-w-[240px] h-[42px]">
//         <div className="relative">
//           <Input
//             type="text"
//             placeholder="Search"
//             className="pl-3 pr-9 h-9 md:h-10 text-xs md:text-sm text-[#595959] font-[400] rounded-[10px] border border-[#C7C7C7] shadow-none w-full"
//             value={searchInputValue}
//             onChange={handleSearchChange}
//             onFocus={() => cameraSearchResults.length > 0 && setShowSearchResults(true)}
//             onBlur={() => setTimeout(() => setShowSearchResults(false), 200)}
//           />
//           <Search className="absolute right-3 cursor-pointer top-1/2 -translate-y-1/2 w-4 h-4 md:w-5 md:h-5 text-[#595959]" />
//           {showSearchResults && (
//             <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-[10px] shadow-lg max-h-48 md:max-h-60 overflow-auto">
//               {cameraSearchResults.length > 0 ? (
//                 cameraSearchResults.map((camera) => (
//                   <div
//                     key={camera.id}
//                     className="px-3 md:px-4 py-2 hover:bg-gray-100 cursor-pointer text-xs md:text-sm"
//                     onClick={() => handleSelectSearchResult(camera)}
//                   >
//                     {camera.name}
//                   </div>
//                 ))
//               ) : (
//                 <div className="px-4 py-2 text-gray-500">No results found</div>
//               )}
//             </div>
//           )}
//         </div>
//       </div>

//       <div className="w-full md:w-auto md:min-w-[200px] lg:min-w-[250px]">        
//         <Select
//           value={selectedNVRId || ''}
//           onValueChange={(value) => {
//             setSelectedNVRId(value);
//             setSearchInputValue('');
//             setCameraSearchResults([]);
//             setShowSearchResults(false);
//           }}
//           disabled={isLoading}
//         >
//           <SelectTrigger className="h-9 md:h-10 text-[#595959] cursor-pointer select-none font-[400] rounded-[10px] border border-[#C7C7C7] text-xs md:text-sm">
//             <SelectValue placeholder="Select NVR" />
//           </SelectTrigger>
//           <SelectContent className='text-[#333333] cursor-pointer font-[400] md:text-sm text-xs'>
//             {nvrOptions.map((option) => (
//               <SelectItem key={option.value} value={option.value} className='cursor-pointer hover:bg-gray-200'>
//                 {option.label}
//               </SelectItem>
//             ))}
//           </SelectContent>
//         </Select>
//       </div>

//       <div className="w-full md:w-auto md:min-w-[180px] lg:min-w-[250px]">
//         <Select
//           value={selectedCameraId || ''}
//           onValueChange={(value) => {
//             setSelectedCameraId(value);
//             const selected = cameraOptions.find(option => option.value === value);
//             setSearchInputValue(selected ? selected.label : '');
//           }}
//           disabled={isLoading || !selectedNVRId}
//         >
//           <SelectTrigger className="h-9 md:h-10 text-[#595959] cursor-pointer select-none font-[400] rounded-[10px] border border-[#C7C7C7] text-xs md:text-sm">
//             <SelectValue placeholder="Select Camera" />
//           </SelectTrigger>
//           <SelectContent className='text-[#333333] cursor-pointer font-[400] md:text-sm text-xs'>
//             {cameraOptions.map((option) => (
//               <SelectItem key={option.value} value={option.value} className='cursor-pointer hover:hover:bg-gray-200'>
//                 {option.label}
//               </SelectItem>
//             ))}
//           </SelectContent>
//         </Select>
//       </div>
//     </div>
//   );
// };

// export default SearchControls;
