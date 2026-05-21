import React, { useState, useEffect } from 'react';
import { Eye, EyeOff, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import Cross from '../../../assets/Cross.svg';
import { addNVRaccount } from './Api/post';
import { nvrSchema } from '@/schema/NVR/addNVR';
import { Formik, Form, Field, ErrorMessage } from 'formik';
import { updateNVRById } from './Api/pacth';
import { toast } from 'sonner';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { decrypt, encrypt } from '@/helpers/decriptNvr';
import { fetchUniqueLocations } from '@/helpers/Userregister/Api/post';
import { createLocation } from '@/page/user/Locations/Api';
import CreatableSelect from 'react-select/creatable';

const AddNVRForm = ({ onClose, isEdit, initialData, fetchNvrData, title }) => {
    const [showPassword, setShowPassword] = useState(false);
    const [showOldPassword, setShowOldPassword] = useState(false);
    const [showNewPassword, setShowNewPassword] = useState(false);
    const [locations, setLocations] = useState([]);

    const loadLocations = async () => {
        try {
            const resp = await fetchUniqueLocations();
            if (resp?.body?.status === 'success') {
                const rawData = resp?.body?.data;
                const locs = Array.isArray(rawData)
                    ? rawData
                    : Array.isArray(rawData?.locations)
                        ? rawData.locations.map(l => l.locationName || l)
                        : [];
                setLocations(locs);
            }
        } catch (error) {
            console.error('Error fetching locations:', error);
        }
    };

    useEffect(() => {
        loadLocations();
    }, []);

    const BORDER = 'border-[#80808059] shadow-none';
    const LABEL_STYLE = 'text-sm font-normal ml-2 text-[#333]';
    const FORM_CONTAINER_STYLE = 'flex flex-col gap-1 rounded-[10px]';
    const FORM_WRAPPER_STYLE = 'w-full sm:w-[600px] bg-white rounded-[24px] px-6 sm:px-16 py-8 sm:py-12 relative max-h-[100vh] overflow-y-auto';

    // Use initialData if isEdit is true, otherwise use default initialValues
    const initialValues = isEdit && initialData ? {
        nvrName: initialData.name || '',
        location: initialData.location || '',
        ip: decrypt(initialData.ipAddress || ''),
        port: initialData.port || '',
        rtspPort: initialData.rtspPort || '',
        username: initialData.username || '',
        oldPassword: '',
        newPassword: '',
        brand: initialData.brand || '',
    } : {
        ip: '',
        port: '',
        rtspPort: '',
        username: '',
        oldPassword: '',
        newPassword: '',
        nvrName: '',
        location: '',
        password: '',
        brand: '',
    };

    const handleSubmit = async (values, { setSubmitting }) => {
        try {
            let payload;
            if (isEdit && initialData && initialData._id) {
                payload = {
                    ip: encrypt(values.ip),
                    port: Number(values.port),
                    rtspPort: Number(values.rtspPort),
                    username: values.username,
                    oldPassword: values.oldPassword,
                    newPassword: values.newPassword,
                    nvrName: values.nvrName,
                    location: values.location,
                    brand: values.brand,
                };
                const update_resp = await updateNVRById(initialData._id, payload);

                if (update_resp?.data?.body?.status === "success") {
                    toast.success(update_resp?.data?.body?.message || '');
                    fetchNvrData();
                } else {
                    toast.error(update_resp?.data?.body?.message || 'Failed to update NVR');
                }
            } else {
                payload = {
                    ip: values.ip,
                    port: Number(values.port),
                    rtspPort: Number(values.rtspPort),
                    username: values.username,
                    password: values.password,
                    nvrName: values.nvrName,
                    location: values.location,
                    brand: values.brand,
                };
                const add_resp = await addNVRaccount(payload);
                if (add_resp?.data?.body?.status === "success") {
                    toast.success(add_resp?.data?.body?.message || '');
                    fetchNvrData();
                } else {
                    toast.error(add_resp?.data?.body?.message || 'Failed to add NVR');
                }
            }
            onClose();
        } catch (error) {
            toast.error(error?.response?.data?.body?.message || 'Failed to add NVR');
            console.error('Error saving NVR:', error);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className='fixed inset-0 flex items-center justify-center bg-black/60 z-50'>
            <div className={FORM_WRAPPER_STYLE}>
                <Button onClick={onClose} className='absolute  top-4 md:top-5 right-4 shadow-none md:right-6 hover:text-black cursor-pointer'>
                    <X alt='cross icon' className='size-6 text-[#333333]' />
                </Button>
                <div className='text-center'>
                    <h2 className='text-lg sm:text-xl font-medium text-[#333333] mb-4 sm:mb-5'>
                        {title || (isEdit && initialData?._id ? 'Edit NVR' : 'Add NVR')}
                    </h2>
                </div>

                <Formik initialValues={initialValues} validationSchema={nvrSchema} validationContext={{ isEdit: isEdit }} onSubmit={handleSubmit}>
                    {({ isSubmitting, dirty, setFieldValue, values }) => (
                        <Form className='flex flex-col gap-5'>
                            <div className={FORM_CONTAINER_STYLE}>
                                <label className={LABEL_STYLE}>Brand*</label>
                                {isEdit ? (
                                    // For edit mode - show disabled input
                                    <Field
                                        name='brand'
                                        as={Input}
                                        disabled={true}
                                        className={BORDER}
                                    />
                                ) : (
                                    // For add mode - show dropdown
                                    <Select
                                        onValueChange={(value) => setFieldValue('brand', value)}
                                        name="brand"
                                    >
                                        <SelectTrigger className="bg-[#FAFAFA] border-[#80808059] shadow-none">
                                            <SelectValue placeholder="Select brand" />
                                        </SelectTrigger>
                                        <SelectContent className="bg-white shadow-md">
                                            <SelectItem value="hikvision" className="hover:bg-[#F5F5F5]">Hikvision</SelectItem>
                                            <SelectItem value="cpplus" className="hover:bg-[#F5F5F5]">CP Plus</SelectItem>
                                            {/* <SelectItem value="prama" className="hover:bg-[#F5F5F5]">Prama</SelectItem> */}
                                        </SelectContent>
                                    </Select>
                                )}
                                <ErrorMessage name='brand' component='div' className='text-sm text-red-600 ml-2' />
                            </div>

                            <div className={FORM_CONTAINER_STYLE}>
                                <label className={LABEL_STYLE}>Name*</label>
                                <Field name='nvrName' as={Input} placeholder='Enter name' className={BORDER} />
                                <ErrorMessage name='nvrName' component='div' className='text-sm text-red-600 ml-2' />
                            </div>

                            <div className={FORM_CONTAINER_STYLE}>
                                <label className={LABEL_STYLE}>Location*</label>
                                <CreatableSelect
                                    isClearable
                                    options={locations.map(loc => ({ value: loc, label: loc }))}
                                    value={values.location ? { value: values.location, label: values.location } : null}
                                    onChange={(option) => setFieldValue('location', option ? option.value : '')}
                                    onCreateOption={async (inputValue) => {
                                        try {
                                            const resp = await createLocation({ locationName: inputValue });
                                            if (resp?.data?.body?.status === 'success') {
                                                toast.success(resp?.data?.body?.message || 'Location created');
                                                await loadLocations();
                                                setFieldValue('location', inputValue);
                                            } else {
                                                toast.error(resp?.data?.body?.message || 'Failed to create location');
                                            }
                                        } catch (error) {
                                            toast.error(error?.response?.data?.body?.message || 'Failed to create location');
                                        }
                                    }}
                                    placeholder="Select or type to create location"
                                    classNamePrefix="rs"
                                    styles={{
                                        control: (base) => ({
                                            ...base,
                                            borderColor: '#80808059',
                                            boxShadow: 'none',
                                            backgroundColor: '#FAFAFA',
                                            borderRadius: '6px',
                                            minHeight: '36px',
                                            '&:hover': { borderColor: '#80808059' },
                                        }),
                                        menu: (base) => ({ ...base, zIndex: 9999 }),
                                        option: (base, state) => ({
                                            ...base,
                                            backgroundColor: state.isFocused ? '#F5F5F5' : 'white',
                                            color: '#333',
                                        }),
                                    }}
                                />
                                <ErrorMessage name='location' component='div' className='text-sm text-red-600 ml-2' />
                            </div>

                            <div className={FORM_CONTAINER_STYLE}>
                                <label className={LABEL_STYLE}>Public IP Address*</label>
                                <Field name='ip' as={Input} placeholder='e.g. 169.253.255.255 ' className={BORDER} />
                                <ErrorMessage name='ip' component='div' className='text-sm text-red-600 ml-2' />
                            </div>

                            <div className={FORM_CONTAINER_STYLE}>
                                <label className={LABEL_STYLE}>Username*</label>
                                <Field name='username' as={Input} placeholder='e.g. admin' className={BORDER} />
                                <ErrorMessage name='username' component='div' className='text-sm text-red-600 ml-2' />
                            </div>

                            {/* Show password field only for add, old/new password for edit */}
                            {!isEdit && (
                                <div className={`${FORM_CONTAINER_STYLE} relative`}>
                                    <label className={LABEL_STYLE}>Password</label>
                                    <Field name='password' as={Input} type={showPassword ? 'text' : 'password'} className={`${BORDER} pr-10`} />
                                    <button
                                        type='button'
                                        onClick={() => setShowPassword(!showPassword)}
                                        className='absolute right-3 top-[33px] text-gray-500'
                                    >
                                        {showPassword ? <Eye size={20} /> : <EyeOff size={20} />}
                                    </button>
                                    <ErrorMessage name='password' component='div' className='text-sm text-red-600 ml-2' />
                                </div>
                            )}

                            {isEdit && (
                                <>
                                    <div className={`${FORM_CONTAINER_STYLE} relative`}>
                                        <label className={LABEL_STYLE}>Old Password</label>
                                        <Field name='oldPassword' as={Input} type={showOldPassword ? 'text' : 'password'} placeholder='••••••••' className={`${BORDER} pr-10`} />
                                        <button
                                            type='button'
                                            onClick={() => setShowOldPassword(!showOldPassword)}
                                            className='absolute right-3 top-[33px] text-gray-500'
                                        >
                                            {showOldPassword ? <Eye size={20} /> : <EyeOff size={20} />}
                                        </button>
                                        <ErrorMessage name='oldPassword' component='div' className='text-sm text-red-600 ml-2' />
                                    </div>

                                    <div className={`${FORM_CONTAINER_STYLE} relative`}>
                                        <label className={LABEL_STYLE}>New Password</label>
                                        <Field name='newPassword' as={Input} type={showNewPassword ? 'text' : 'password'} placeholder='••••••••' className={`${BORDER} pr-10`} />
                                        <button
                                            type='button'
                                            onClick={() => setShowNewPassword(!showNewPassword)}
                                            className='absolute right-3 top-[33px] text-gray-500'
                                        >
                                            {showNewPassword ? <Eye size={20} /> : <EyeOff size={20} />}
                                        </button>
                                        <ErrorMessage name='newPassword' component='div' className='text-sm text-red-600 ml-2' />
                                    </div>
                                </>
                            )}

                            <div className={FORM_CONTAINER_STYLE}>
                                <label className={LABEL_STYLE}>RTSP Port*</label>
                                <Field name='rtspPort' as={Input} placeholder='e.g. 554' className={BORDER} />
                                <ErrorMessage name='rtspPort' component='div' className='text-sm text-red-600 ml-2' />
                            </div>

                            <div className={FORM_CONTAINER_STYLE}>
                                <label className={LABEL_STYLE}>Port*</label>
                                <Field name='port' as={Input} placeholder='e.g. 80' className={BORDER} />
                                <ErrorMessage name='port' component='div' className='text-sm text-red-600 ml-2' />
                            </div>

                            <div className='flex justify-center items-center'>
                                <Button
                                    type='submit'
                                    disabled={isSubmitting || !dirty}
                                    className={`mt-6 h-[46px] cursor-pointer w-[172px] rounded-4xl text-white transition-colors text-base sm:text-lg font-normal ${isSubmitting || !dirty ? 'bg-gray-400 cursor-not-allowed' : 'bg-[#07486a] hover:bg-[#07486a]'
                                        }`}
                                >
                                    {isSubmitting ? (isEdit ? 'Saving...' : 'Adding...') : (isEdit ? 'Save' : 'Add')}
                                </Button>
                            </div>
                        </Form>
                    )}
                </Formik>
            </div>
        </div>
    );
};

export default AddNVRForm;
