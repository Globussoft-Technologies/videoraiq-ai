import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Search, SquarePen } from 'lucide-react';
import Skeleton, { SkeletonTheme } from 'react-loading-skeleton';
import 'react-loading-skeleton/dist/skeleton.css';
import { authorizedUsers } from './Api/get';
// import { USER_AVTAR_INITIALS } from '@/components/Avatars';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { updateAuthorizedUsers } from './Api/put';
import { toast } from 'sonner';
import { Formik, Form, Field, ErrorMessage } from 'formik';
import { validationSchema } from './validation';
import { Button } from '@/components/ui/button';
import moment from 'moment';
import useDebounce from '@/hooks/useDebounce';

const EmployeesOnDuty = ({ canEdit, isAccessLogVisible }) => {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [skip, setSkip] = useState(0);
  const limit = 20;
  const listRef = useRef(null);
  const [hasMore, setHasMore] = useState(true);
  // Track image loaded state per employee by id
  const [imageLoaded, setImageLoaded] = useState({});
  const [imageError, setImageError] = useState({});
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const nasUrl = import.meta.env.VITE_BACKEND;
  const [employeeId, setEmployeeId] = useState(null);
  const [originalFirstName, setOriginalFirstName] = useState();
  const [originalLastName, setOriginalLastName] = useState();
  const [originalEmail, setOriginalEmail] = useState();
  const [editableField, setEditableField] = useState(null); // Track which field is editable
  const [totalUsers, setTotalUsers] = useState(0);
  const currentDate = moment().format('DD-MM-YYYY');
  const USER_AVTAR_INITIALS = import.meta.env.VITE_INITIALS_URL;
  const [searchInput, setSearchInput] = useState('');
  const debouncedSearch = useDebounce(searchInput, 500);
  const isFetchingRef = useRef(false);
  const fetchEmployees = async (skipValue = 0, term = '') => {
  if (isFetchingRef.current) return;

  try {
    isFetchingRef.current = true;

    if (skipValue === 0) {
      setLoading(true);
    }

    const result = await authorizedUsers(skipValue, limit, term);

    if (result.body.status === 'success') {
      const newUsers = result.body.data.users || [];
      setTotalUsers(result.body.data.totalCount || 0);
      setHasMore(newUsers.length === limit);

      setEmployees((prev) =>
        skipValue === 0 ? newUsers : [...prev, ...newUsers]
      );
    }
  } finally {
    isFetchingRef.current = false;
    setLoading(false);
  }
};


  // Shared pagination logic
  const fetchNextEmployees = useCallback(
    (nextSkip, searchTerm) => {
      if (loading || !hasMore) {
        return;
      }
      fetchEmployees(nextSkip, searchTerm);
      setSkip(nextSkip);
    },
    [loading, hasMore]
  );

  const handleScroll = useCallback(() => {
  if (loading || isFetchingRef.current) return;

  const el = listRef.current;
  if (!el) return;

  if (el.scrollTop + el.clientHeight >= el.scrollHeight - 10) {
    const nextSkip = skip + limit;
    fetchNextEmployees(nextSkip, debouncedSearch);
  }
}, [skip, limit, debouncedSearch, fetchNextEmployees, loading]);

  useEffect(() => {
    setSkip(0);
    setEmployees([]);
    setHasMore(true);
    fetchEmployees(0, debouncedSearch);
  }, [debouncedSearch, isAccessLogVisible, limit]);

  useEffect(() => {
    const ref = listRef.current;
    if (!ref) return;

    ref.addEventListener('scroll', handleScroll);
    return () => ref.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  const handleUpdateSubmit = async (values) => {
    const departmentId =
      selectedEmployee?.departmentId?._id || selectedEmployee?.departmentId;
    const isSame =
      values.firstName.trim() === originalFirstName.trim() &&
      values.lastName.trim() === originalLastName.trim() &&
      values.email.trim() === originalEmail.trim();

    if (isSame) {
      toast.warning('No Changes Made');
      return;
    }

    const response = await updateAuthorizedUsers(
      employeeId,
      values,
      departmentId
    );
    if (response.statusCode === 200) {
      toast.success(
        response?.body?.message || 'Authorized user updated successfully'
      );
        // fetchEmployees(0, debouncedSearch);
        setIsDialogOpen(false);
        setEditableField(null);
      
        isFetchingRef.current = false;
        //RESET pagination state
        setSkip(0);
        setHasMore(true);
        setEmployees([]);

         //Refetch from beginning
        fetchEmployees(0, debouncedSearch);
      // setEmployees((prev) =>
      //   prev.map((emp) =>
      //     emp._id === employeeId ? { ...emp, ...values } : emp
      //   )
      // );
    } else {
      toast.error(response?.body?.message || 'Something Went Wrong');
    }
  };
  const EmployeeSkeleton = () => (
    <div
      className={`p-1.5 sm:p-2 ${!isAccessLogVisible ? 'flex flex-col items-start' : 'flex items-center'}`}
    >
      <Skeleton
        height={44}
        width={44}
        borderRadius={8}
        className={`${!isAccessLogVisible ? 'mb-2' : 'mr-2 sm:mr-3'} sm:w-[48px] sm:h-[48px] xl:w-[48px] xl:h-[48px]`}
      />
      <div
        className={`${!isAccessLogVisible ? 'w-full' : 'flex-1'} space-y-1.5 sm:space-y-2`}
      >
        <Skeleton height={13} width="70%" className="sm:h-[14px] xl:h-[14px]" />
        <Skeleton height={10} width="50%" className="sm:h-[11px] xl:h-[11px]" />
      </div>
      {!isAccessLogVisible ? null : (
        <Skeleton
          height={12}
          width="60px"
          className="sm:h-[13px] xl:h-[12px] sm:w-[80px]"
        />
      )}
    </div>
  );

  return (
    <div className="bg-[#fafafa] rounded-[10px] px-[21px] xl:px-[16px] pb-[14px]">
      <div className="flex items-center justify-between py-4 sm:py-6">
        <div className="flex items-center">
          <h3 className="text-sm sm:text-base xl:text-[14px] text-[#7A7A7A] font-medium">
            Authorized Employees
            <sup>
              <span className="rounded-2xl bg-[#07486A] text-[#FFFFFF] text-xs font-semibold px-2 py-[2px] ml-2">
                {totalUsers}
              </span>
            </sup>
          </h3>
        </div>
        {/* <div className="flex items-center gap-0.5 sm:gap-1 text-xs sm:text-sm xl:text-[12px] text-[#595959]">
          <Calendar className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#595959] font-[400]" />
           {currentDate}
        </div> */}
      </div>
      <div className="flex items-center gap-3 pb-2">
        <div className="relative w-full ">
          <Input
            type="text"
            placeholder="Search Employees"
            className="pl-4 pr-10 shadow-none border border-[#C7C7C7] text-[#595959] h-10 w-full"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
          <Search className="absolute right-2 sm:right-3 top-1/2 -translate-y-1/2 w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6 text-[#595959]" />
        </div>
      </div>
      <div
        className={
          !isAccessLogVisible
            ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2 overflow-auto h-[500px] pr-[4px]'
            : 'space-y-1.5 overflow-auto h-[500px] pr-[4px]'
        }
        ref={listRef}
      >
        {loading && employees.length === 0 ? (
          <div
            className={
              !isAccessLogVisible
                ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2 col-span-1 md:col-span-2 lg:col-span-3 xl:col-span-4'
                : 'space-y-1.5 pr-2'
            }
          >
            {Array(limit)
              .fill(0)
              .map((_, index) => (
                <EmployeeSkeleton key={index} />
              ))}
          </div>
        ) : (
          <>
            {Array.isArray(employees) && employees.length > 0 ? (
              employees.map((employee) => {
                const loaded = imageLoaded[employee._id];
                return (
                  <div
                    key={employee._id}
                    className={`hover:bg-gray-50 rounded-lg transition-colors cursor-pointer p-1.5 sm:p-2 ${
                      !isAccessLogVisible
                        ? 'flex flex-col items-start'
                        : 'flex items-center'
                    }`}
                    onClick={() => {
                      setEmployeeId(employee._id);
                      setSelectedEmployee(employee);
                      setOriginalFirstName(employee.firstName);
                      setOriginalLastName(employee.lastName);
                      setOriginalEmail(employee.email);
                      setIsDialogOpen(true);
                    }}
                  >
                    {!loaded && (
                      <Skeleton
                        width={56}
                        className={`${!isAccessLogVisible ? 'mb-2' : 'mr-2'}`}
                        height={56}
                        borderRadius={10}
                      />
                    )}
                    {employee?.profilePics[0] ? (
                      <img
                        src={`${nasUrl}/api/v1/uploads/${employee?.profilePics[0]}`}
                        alt={employee.firstName}
                        crossOrigin="anonymous"
                        onLoad={() =>
                          setImageLoaded((prev) => ({
                            ...prev,
                            [employee._id]: true,
                          }))
                        }
                        onError={() =>
                          setImageLoaded((prev) => ({
                            ...prev,
                            [employee._id]: true,
                          }))
                        }
                        className={`w-[44px] h-[44px] sm:w-[48px] sm:h-[48px] xl:w-[48px] xl:h-[48px] rounded-[8px] sm:rounded-[10px] object-cover ${
                          !isAccessLogVisible ? 'mb-2' : 'mr-2 sm:mr-3'
                        } ${loaded ? 'block' : 'hidden'}`}
                      />
                    ) : (
                      <img
                        src={`${USER_AVTAR_INITIALS}=${encodeURIComponent(
                          `${employee.firstName || ''} ${employee.lastName || ''}`
                        )}`}
                        alt={employee.firstName}
                        crossOrigin="anonymous"
                        onLoad={() =>
                          setImageLoaded((prev) => ({
                            ...prev,
                            [employee._id]: true,
                          }))
                        }
                        onError={() =>
                          setImageLoaded((prev) => ({
                            ...prev,
                            [employee._id]: true,
                          }))
                        }
                        className={`w-[44px] h-[44px] sm:w-[48px] sm:h-[48px] xl:w-[48px] xl:h-[48px] rounded-[8px] sm:rounded-[10px] object-cover ${
                          !isAccessLogVisible ? 'mb-2' : 'mr-2 sm:mr-3'
                        } ${loaded ? 'block' : 'hidden'}`}
                      />
                    )}
                    <div className="flex-1">
                      <p className="text-[13px] sm:text-[14px] xl:text-[14px] font-[500] text-[#323232]">
                        {employee?.userName || ''}
                      </p>
                      <p className="text-[12px] sm:text-[13px] xl:text-[13px] font-[400] text-[#7a7a7a]">
                        {employee?.departmentId?.departmentName}
                      </p>
                      <p className="text-[10px] sm:text-[11px] xl:text-[11px] text-[#7a7a7a] font-[400]">
                        {employee.email}
                      </p>
                    </div>
                  </div>
                );
              })
            ) : !loading &&
              Array.isArray(employees) &&
              employees.length === 0 ? (
              <div
                className={`flex items-center justify-center h-[507px] ${!isAccessLogVisible ? 'col-span-1 md:col-span-2 lg:col-span-3 xl:col-span-4' : ''}`}
              >
                <p className="text-center text-sm text-gray-400 py-2">
                  No Employees Found
                </p>
              </div>
            ) : null}
          </>
        )}
        {/* Profile Edit Dialog */}{' '}
        <Dialog
          open={isDialogOpen}
          onOpenChange={(open) => {
            setIsDialogOpen(open);
            if (!open) setEditableField(null);
          }}
        >
          <DialogContent className="w-[95%] sm:w-full max-w-xl top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-xl sm:rounded-2xl px-3 sm:px-8 py-4 sm:py-6 max-h-[95vh] sm:max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-center text-base sm:text-lg font-medium text-[#333] w-full">
                Employee Profile
              </DialogTitle>
            </DialogHeader>

            {selectedEmployee && (
              <Formik
                enableReinitialize
                initialValues={{
                  firstName: originalFirstName,
                  lastName: originalLastName,
                  email: originalEmail,
                  departmentId:
                    selectedEmployee?.departmentId?._id ||
                    selectedEmployee?.departmentId,
                }}
                validationSchema={validationSchema}
                onSubmit={handleUpdateSubmit}
              >
                {({ handleSubmit }) => (
                  <Form
                    onSubmit={handleSubmit}
                    className="flex flex-col items-center gap-6 mt-4"
                  >
                    <div className="w-16 h-16 sm:w-24 sm:h-24 md:w-28 md:h-28 rounded-full overflow-hidden">
                      <img
                        src={
                          selectedEmployee?.profilePics?.[0]
                            ? `${nasUrl}/api/v1/uploads/${selectedEmployee.profilePics[0]}`
                            : `${USER_AVTAR_INITIALS}=${encodeURIComponent(
                                `${selectedEmployee?.firstName || ''} ${selectedEmployee?.lastName || ''}`
                              )}`
                        }
                        crossOrigin="anonymous"
                        alt={selectedEmployee?.firstName || 'Employee Avatar'}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="w-full space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {[
                          { label: 'First Name', name: 'firstName' },
                          { label: 'Last Name', name: 'lastName' },
                        ].map((field) => (
                          <div key={field.name}>
                            <label
                              htmlFor={field.name}
                              className="block text-xs sm:text-sm font-normal text-[#7A7A7A] mb-0.5 sm:mb-1"
                            >
                              {field.label}
                            </label>
                            <div className="relative">
                              <Field
                                as={Input}
                                name={field.name}
                                className={`transition-all duration-200 shadow-none border border-[#80808059] ${editableField === field.name ? 'ring-transparent bg-[#F2F8FA]' : ''}`}
                                autoFocus={false}
                                tabIndex={-1}
                                readOnly={editableField !== field.name}
                              />
                              <SquarePen
                                className={`absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 transition-all duration-200 ${editableField === field.name ? 'text-[#07486A] rotate-6' : canEdit ? 'text-gray-500' : 'text-gray-300'} ${canEdit ? 'cursor-pointer hover:scale-110' : 'cursor-not-allowed'}`}
                                onClick={() =>
                                  canEdit && setEditableField(field.name)
                                }
                              />
                            </div>
                            <div className="min-h-[20px] ml-2 mt-1">
                              <ErrorMessage
                                name={field.name}
                                component="div"
                                className="text-red-500 text-xs"
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                      <div>
                        <label
                          htmlFor="email"
                          className="block text-sm font-normal text-[#7A7A7A] mb-1"
                        >
                          Email ID
                        </label>
                        <div className="relative">
                          <Field
                            as={Input}
                            name="email"
                            autoFocus={false}
                            tabIndex={-1}
                            className={`transition-all duration-200 shadow-none text-gray-500 border border-[#80808059] ${editableField === 'email' ? 'ring-transparent bg-[#F2F8FA]' : ''}`}
                            readOnly={editableField !== 'email'}
                          />
                          <SquarePen
                            className={`absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 transition-all duration-200 ${editableField === 'email' ? 'text-[#07486A] rotate-6' : canEdit ? 'text-gray-400' : 'text-gray-300'} ${canEdit ? 'cursor-pointer hover:scale-110' : 'cursor-not-allowed'}`}
                            onClick={() => canEdit && setEditableField('email')}
                          />
                        </div>
                        <div className="min-h-[20px]">
                          <ErrorMessage
                            name="email"
                            component="div"
                            className="text-red-500 text-xs"
                          />
                        </div>
                      </div>
                    </div>
                    <div className="mt-4 self-center flex flex-col sm:flex-row items-center gap-2 sm:gap-1.5 w-full sm:w-auto">
                      <Button
                        type="button"
                        onClick={() => {
                          setIsDialogOpen(false);
                          setEditableField(null);
                        }}
                        className="w-full focus:ring-transparent cursor-pointer sm:w-auto px-4 h-9 sm:h-10 text-gray-700 rounded-full hover:bg-gray-100 text-sm"
                      >
                        Close
                      </Button>
                      <Button
                        type="submit"
                        disabled={!canEdit}
                        className={`w-full ${!canEdit ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'} sm:w-auto px-4 h-9 sm:h-10 rounded-full bg-[#004B66] text-white hover:bg-[#003B52] text-sm`}
                      >
                        Save Profile
                      </Button>
                    </div>
                  </Form>
                )}
              </Formik>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
};

export default EmployeesOnDuty;
