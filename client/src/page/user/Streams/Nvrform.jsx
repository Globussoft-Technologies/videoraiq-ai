import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Eye, EyeOff, X, Loader2, ArrowLeft, Play, Maximize2, Minimize2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { registerAndFetchCameras, addSelectedCameras } from './Api/post';
import { removeCamera } from './Api/delete';
import { nvrSchema } from '@/schema/NVR/addNVR';
import { Formik, Form, Field, ErrorMessage } from 'formik';
import { updateNVRById } from './Api/patch';
import { toast } from 'sonner';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { decrypt, encrypt } from '@/helpers/decriptNvr';
import { fetchUniqueLocations } from '@/helpers/Userregister/Api/post';
import { createLocation } from '@/page/user/Locations/Api';
import CreatableSelect from 'react-select/creatable';
import getAccessToken from '@/utils/getAccessToken';
import axios from 'axios';
import useHlsPlayer from '@/hooks/useHlsPlayer';

const HOST = import.meta.env.VITE_BACKEND;
const STREAM_BASE = import.meta.env.VITE_STREAM_URL;
const LOCAL_SETUP = import.meta.env.VITE_LOCAL_SETUP;

const CameraPreviewModal = ({ cam, onClose }) => {
    const videoRef = useRef(null);
    const containerRef = useRef(null);
    const [isLoading, setIsLoading] = useState(true);
    const [hasError, setHasError] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');
    const [isFullscreen, setIsFullscreen] = useState(false);

    const streamUrl = useMemo(() => {
        if (!cam?.streamingUrl) return null;
        if (LOCAL_SETUP === 'true') return cam.streamingUrl;
        return STREAM_BASE + cam.streamingUrl;
    }, [cam?.streamingUrl]);

    useHlsPlayer(videoRef, streamUrl, {
        autoPlay: true,
        onError: (msg) => {
            setErrorMsg(msg);
            setIsLoading(false);
            setHasError(true);
        },
    });

    useEffect(() => {
        const handleFsChange = () => {
            const fsEl = document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement;
            setIsFullscreen(!!fsEl);
        };
        document.addEventListener('fullscreenchange', handleFsChange);
        document.addEventListener('webkitfullscreenchange', handleFsChange);
        document.addEventListener('msfullscreenchange', handleFsChange);
        return () => {
            document.removeEventListener('fullscreenchange', handleFsChange);
            document.removeEventListener('webkitfullscreenchange', handleFsChange);
            document.removeEventListener('msfullscreenchange', handleFsChange);
        };
    }, []);

    const toggleFullscreen = () => {
        if (!document.fullscreenElement) {
            containerRef.current?.requestFullscreen?.();
        } else {
            document.exitFullscreen?.();
        }
    };

    return (
        <div
            className='fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm'
            onClick={onClose}
        >
            <div
                ref={containerRef}
                className='relative w-full max-w-2xl bg-neutral-900 rounded-2xl overflow-hidden border border-white/10 shadow-2xl'
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className='flex items-center justify-between px-5 py-3 border-b border-white/10'>
                    <div className='flex items-center gap-2'>
                        <div className='w-2 h-2 rounded-full bg-red-500 animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.6)]' />
                        <span className='text-white text-sm font-medium'>{cam.name}</span>
                        <span className='text-[11px] text-neutral-400 border border-white/10 px-2 py-0.5 rounded bg-white/5'>
                            Channel {cam.channelId}
                        </span>
                    </div>
                    <div className='flex items-center gap-1'>
                        <button
                            onClick={toggleFullscreen}
                            className='p-1.5 text-neutral-400 hover:text-white hover:bg-white/10 rounded-full transition-all cursor-pointer'
                            title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
                        >
                            {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                        </button>
                        <button
                            onClick={onClose}
                            className='p-1.5 text-neutral-400 hover:text-white hover:bg-white/10 rounded-full transition-all cursor-pointer'
                        >
                            <X size={18} />
                        </button>
                    </div>
                </div>

                {/* Video area */}
                <div className='relative bg-black aspect-video w-full flex items-center justify-center'>
                    {isLoading && !hasError && (
                        <div className='absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/80 z-10'>
                            <Loader2 className='animate-spin text-white w-8 h-8' />
                            <span className='text-neutral-400 text-xs'>Connecting to stream...</span>
                        </div>
                    )}
                    {hasError && (
                        <div className='absolute inset-0 flex flex-col items-center justify-center text-white text-sm bg-black/80 z-20 text-center'>
                            <p>Unable to load stream</p>
                            <p className='text-xs opacity-70 mt-1'>{errorMsg || 'Camera offline'}</p>
                        </div>
                    )}
                    <video
                        ref={videoRef}
                        className='w-full h-full object-cover'
                        autoPlay
                        muted
                        playsInline
                        preload='metadata'
                        onCanPlay={() => { setIsLoading(false); setHasError(false); }}
                        onPlaying={() => { setIsLoading(false); setHasError(false); }}
                    />
                    <div className='absolute bottom-3 left-3 z-10'>
                        <span className='text-[10px] font-bold bg-red-500/20 text-red-400 px-2 py-1 rounded border border-red-500/30 tracking-wider'>
                            LIVE PREVIEW
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
};

const BORDER = 'border-[#80808059] shadow-none';
const LABEL_STYLE = 'text-sm font-normal ml-2 text-[#333]';
const FORM_CONTAINER_STYLE = 'flex flex-col gap-1 rounded-[10px]';
const FORM_WRAPPER_STYLE = 'w-full sm:w-[600px] bg-white rounded-[24px] px-6 sm:px-16 py-8 sm:py-12 relative max-h-[100vh] overflow-y-auto';

const AddNVRForm = ({ onClose, isEdit, initialData, fetchNvrData, title }) => {
    const [showPassword, setShowPassword] = useState(false);
    const [showOldPassword, setShowOldPassword] = useState(false);
    const [showNewPassword, setShowNewPassword] = useState(false);
    const [locations, setLocations] = useState([]);

    const [step, setStep] = useState(1);
    const [fetchedCameras, setFetchedCameras] = useState([]);
    const [savedNvrId, setSavedNvrId] = useState(isEdit ? initialData?._id : null);
    const [initialAdded, setInitialAdded] = useState(new Map());
    const [selectedCameras, setSelectedCameras] = useState(new Set());
    const [isFetching, setIsFetching] = useState(false);
    const [isSavingCameras, setIsSavingCameras] = useState(false);
    const [previewCam, setPreviewCam] = useState(null);

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

    useEffect(() => { loadLocations(); }, []);

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

    const fetchCamerasForNvr = async (nvrId) => {
        const token = getAccessToken();
        const res = await axios.get(`${HOST}/api/v1/nvr/edit/${nvrId}`, {
            headers: { 'x-access-token': token },
        });
        return res?.data?.body;
    };

    const applyFetchedCameras = (available) => {
        const addedMap = new Map();
        const selectedSet = new Set();
        available.forEach((cam) => {
            if (cam.isAdded && cam.dbId) {
                addedMap.set(cam.channelId, cam.dbId);
                selectedSet.add(cam.channelId);
            }
        });
        setFetchedCameras(available);
        setInitialAdded(addedMap);
        setSelectedCameras(selectedSet);
    };

    const handleAddStep1 = async (values, { setSubmitting }) => {
        setIsFetching(true);
        try {
            const payload = {
                ip: values.ip,
                port: Number(values.port),
                rtspPort: Number(values.rtspPort),
                username: values.username,
                password: values.password,
                nvrName: values.nvrName,
                location: values.location,
                brand: values.brand,
            };
            const resp = await registerAndFetchCameras(payload);
            const body = resp?.data?.body;
            if (body?.status === 'success') {
                setSavedNvrId(body.data.nvr._id);
                applyFetchedCameras(body.data.cameras || []);
                setStep(2);
            } else {
                toast.error(body?.message || 'Failed to connect to NVR');
            }
        } catch (error) {
            toast.error(error?.response?.data?.body?.message || 'Failed to connect to NVR');
        } finally {
            setIsFetching(false);
            setSubmitting(false);
        }
    };

    const handleEditStep1 = async (values, { setSubmitting }) => {
        setIsFetching(true);
        try {
            const payload = {
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
            if (update_resp?.data?.body?.status !== 'success') {
                toast.error(update_resp?.data?.body?.message || 'Failed to update NVR');
                return;
            }
            toast.success(update_resp?.data?.body?.message || 'NVR updated');
            fetchNvrData();

            const camerasBody = await fetchCamerasForNvr(initialData._id);
            if (camerasBody?.status === 'success') {
                applyFetchedCameras(camerasBody.data.availableCameras || []);
                setStep(2);
            } else {
                toast.error(camerasBody?.message || 'Failed to load cameras');
                onClose();
            }
        } catch (error) {
            toast.error(error?.response?.data?.body?.message || 'Failed to update NVR');
        } finally {
            setIsFetching(false);
            setSubmitting(false);
        }
    };

    const toggleCamera = (channelId) => {
        setSelectedCameras((prev) => {
            const next = new Set(prev);
            if (next.has(channelId)) next.delete(channelId);
            else next.add(channelId);
            return next;
        });
    };

    const handleSelectAll = () => setSelectedCameras(new Set(fetchedCameras.map((c) => c.channelId)));
    const handleDeselectAll = () => setSelectedCameras(new Set());

    const handleSaveCameras = async () => {
        setIsSavingCameras(true);
        try {
            const toAdd = fetchedCameras.filter(
                (cam) => selectedCameras.has(cam.channelId) && !initialAdded.has(cam.channelId)
            );
            const toRemove = fetchedCameras.filter(
                (cam) => !selectedCameras.has(cam.channelId) && initialAdded.has(cam.channelId)
            );

            if (toAdd.length === 0 && toRemove.length === 0) {
                toast.info('No camera changes made');
                onClose();
                return;
            }

            const errors = [];

            if (toAdd.length > 0) {
                const cameraIds = toAdd.map(cam => cam.channelId);
                const resp = await addSelectedCameras({ nvrId: savedNvrId, cameraIds });
                if (resp?.data?.body?.status !== 'success') {
                    errors.push(resp?.data?.body?.message || 'Failed to add cameras');
                }
            }

            for (const cam of toRemove) {
                try {
                    const resp = await removeCamera(String(initialAdded.get(cam.channelId)));
                    if (resp?.data?.body?.status !== 'success') {
                        errors.push(`Failed to remove ${cam.name}`);
                    }
                } catch {
                    errors.push(`Failed to remove ${cam.name}`);
                }
            }

            if (errors.length > 0) {
                errors.forEach((e) => toast.error(e));
            } else {
                const parts = [];
                if (toAdd.length > 0) parts.push(`${toAdd.length} camera${toAdd.length > 1 ? 's' : ''} added`);
                if (toRemove.length > 0) parts.push(`${toRemove.length} camera${toRemove.length > 1 ? 's' : ''} removed`);
                toast.success(parts.join(', '));
                fetchNvrData();
                onClose();
            }
        } catch {
            toast.error('Something went wrong while saving cameras');
        } finally {
            setIsSavingCameras(false);
        }
    };

    const allSelected = fetchedCameras.length > 0 && selectedCameras.size === fetchedCameras.length;

    return (
        <div className='fixed inset-0 flex items-center justify-center bg-black/60 z-50'>
            <div className={FORM_WRAPPER_STYLE}>
                <Button onClick={onClose} className='absolute top-4 md:top-5 right-4 shadow-none md:right-6 hover:text-black cursor-pointer'>
                    <X className='size-6 text-[#333333]' />
                </Button>

                <div className='text-center'>
                    <h2 className='text-lg sm:text-xl font-medium text-[#333333] mb-1'>
                        {title || (step === 1
                            ? (isEdit ? 'Edit NVR' : 'Add NVR')
                            : (isEdit ? 'Manage Cameras' : 'Select Cameras')
                        )}
                    </h2>
                    <p className='text-sm text-[#7A7A7A] mb-5'>
                        {step === 1
                            ? (isEdit ? 'Update NVR credentials' : 'Enter NVR credentials to connect')
                            : 'Check to add · Uncheck to remove'
                        }
                    </p>
                </div>

                <div className='flex items-center justify-center gap-2 mb-6'>
                    <div className={`flex items-center justify-center w-6 h-6 rounded-full text-xs font-medium ${step >= 1 ? 'bg-[#07486a] text-white' : 'bg-gray-200 text-gray-500'}`}>1</div>
                    <div className={`h-px w-10 ${step >= 2 ? 'bg-[#07486a]' : 'bg-gray-200'}`} />
                    <div className={`flex items-center justify-center w-6 h-6 rounded-full text-xs font-medium ${step >= 2 ? 'bg-[#07486a] text-white' : 'bg-gray-200 text-gray-500'}`}>2</div>
                </div>

                <Formik
                    initialValues={initialValues}
                    validationSchema={nvrSchema}
                    validationContext={{ isEdit }}
                    onSubmit={isEdit ? handleEditStep1 : handleAddStep1}
                >
                    {({ isSubmitting, dirty, setFieldValue, values }) => (
                        <>
                            {step === 1 && (
                                <Form className='flex flex-col gap-5'>
                                    <div className={FORM_CONTAINER_STYLE}>
                                        <label className={LABEL_STYLE}>Brand*</label>
                                        {isEdit ? (
                                            <Field name='brand' as={Input} disabled className={BORDER} />
                                        ) : (
                                            <Select onValueChange={(v) => setFieldValue('brand', v)} name='brand'>
                                                <SelectTrigger className='bg-[#FAFAFA] border-[#80808059] shadow-none'>
                                                    <SelectValue placeholder='Select brand' />
                                                </SelectTrigger>
                                                <SelectContent className='bg-white shadow-md'>
                                                    <SelectItem value='hikvision'>Hikvision</SelectItem>
                                                    <SelectItem value='cpplus'>CP Plus</SelectItem>
                                                    <SelectItem value='tiandy'>Tiandy</SelectItem>
                                                    <SelectItem value='securus'>Securus</SelectItem>
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
                                            onChange={(opt) => setFieldValue('location', opt ? opt.value : '')}
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
                                            placeholder='Select or type to create location'
                                            classNamePrefix='rs'
                                            styles={{
                                                control: (base) => ({ ...base, borderColor: '#80808059', boxShadow: 'none', backgroundColor: '#FAFAFA', borderRadius: '6px', minHeight: '36px', '&:hover': { borderColor: '#80808059' } }),
                                                menu: (base) => ({ ...base, zIndex: 9999 }),
                                                option: (base, state) => ({ ...base, backgroundColor: state.isFocused ? '#F5F5F5' : 'white', color: '#333' }),
                                            }}
                                        />
                                        <ErrorMessage name='location' component='div' className='text-sm text-red-600 ml-2' />
                                    </div>

                                    <div className={FORM_CONTAINER_STYLE}>
                                        <label className={LABEL_STYLE}>Public IP Address*</label>
                                        <Field name='ip' as={Input} placeholder='e.g. 169.253.255.255' className={BORDER} />
                                        <ErrorMessage name='ip' component='div' className='text-sm text-red-600 ml-2' />
                                    </div>

                                    <div className={FORM_CONTAINER_STYLE}>
                                        <label className={LABEL_STYLE}>Username*</label>
                                        <Field name='username' as={Input} placeholder='e.g. admin' className={BORDER} />
                                        <ErrorMessage name='username' component='div' className='text-sm text-red-600 ml-2' />
                                    </div>

                                    {!isEdit && (
                                        <div className={`${FORM_CONTAINER_STYLE} relative`}>
                                            <label className={LABEL_STYLE}>Password</label>
                                            <Field name='password' as={Input} type={showPassword ? 'text' : 'password'} className={`${BORDER} pr-10`} />
                                            <button type='button' onClick={() => setShowPassword(!showPassword)} className='absolute right-3 top-[33px] text-gray-500'>
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
                                                <button type='button' onClick={() => setShowOldPassword(!showOldPassword)} className='absolute right-3 top-[33px] text-gray-500'>
                                                    {showOldPassword ? <Eye size={20} /> : <EyeOff size={20} />}
                                                </button>
                                                <ErrorMessage name='oldPassword' component='div' className='text-sm text-red-600 ml-2' />
                                            </div>
                                            <div className={`${FORM_CONTAINER_STYLE} relative`}>
                                                <label className={LABEL_STYLE}>New Password</label>
                                                <Field name='newPassword' as={Input} type={showNewPassword ? 'text' : 'password'} placeholder='••••••••' className={`${BORDER} pr-10`} />
                                                <button type='button' onClick={() => setShowNewPassword(!showNewPassword)} className='absolute right-3 top-[33px] text-gray-500'>
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
                                            disabled={isSubmitting || isFetching || !dirty}
                                            className={`mt-6 h-[46px] cursor-pointer w-[172px] rounded-4xl text-white transition-colors text-base sm:text-lg font-normal ${isSubmitting || isFetching || !dirty ? 'bg-gray-400 cursor-not-allowed' : 'bg-[#07486a] hover:bg-[#07486a]'}`}
                                        >
                                            {isFetching || isSubmitting
                                                ? <><Loader2 className='animate-spin w-4 h-4 mr-2' />{isEdit ? 'Saving...' : 'Connecting...'}</>
                                                : 'Next'
                                            }
                                        </Button>
                                    </div>
                                </Form>
                            )}

                            {step === 2 && (
                                <div className='flex flex-col gap-4'>
                                    <div className='flex items-center justify-between'>
                                        <span className='text-sm text-[#7A7A7A]'>
                                            {selectedCameras.size} of {fetchedCameras.length} selected
                                        </span>
                                        <button
                                            type='button'
                                            onClick={allSelected ? handleDeselectAll : handleSelectAll}
                                            className='text-sm text-[#07486a] hover:text-[#05364f] font-medium cursor-pointer'
                                        >
                                            {allSelected ? 'Deselect all' : 'Select all'}
                                        </button>
                                    </div>

                                    <div className='max-h-[340px] overflow-y-auto space-y-2 pr-1'>
                                        {fetchedCameras.map((cam) => (
                                            <div
                                                key={cam.channelId}
                                                className='flex items-center gap-3 p-3 rounded-lg border border-[#80808059] hover:bg-[#F5F9FF] transition-colors'
                                            >
                                                <input
                                                    type='checkbox'
                                                    checked={selectedCameras.has(cam.channelId)}
                                                    onChange={() => toggleCamera(cam.channelId)}
                                                    className='w-4 h-4 accent-[#07486a] cursor-pointer flex-shrink-0'
                                                />
                                                <label
                                                    onClick={() => toggleCamera(cam.channelId)}
                                                    className='flex-1 min-w-0 cursor-pointer'
                                                >
                                                    <p className='text-sm font-medium text-[#333333] truncate'>{cam.name}</p>
                                                    <p className='text-xs text-[#7A7A7A]'>Channel {cam.channelId}</p>
                                                </label>
                                                {cam.isAdded && (
                                                    <span className='text-[10px] bg-[#E5F6FF] text-[#07486a] px-2 py-0.5 rounded-full whitespace-nowrap flex-shrink-0'>
                                                        Added
                                                    </span>
                                                )}
                                                {cam.streamingUrl && (
                                                    <button
                                                        type='button'
                                                        onClick={() => setPreviewCam(cam)}
                                                        title='Preview stream'
                                                        className='flex-shrink-0 flex items-center gap-1 text-[11px] text-[#07486a] border border-[#07486a]/30 bg-[#07486a]/5 hover:bg-[#07486a]/10 px-2 py-1 rounded-full transition-colors cursor-pointer'
                                                    >
                                                        <Play size={11} className='fill-[#07486a]' />
                                                        Preview
                                                    </button>
                                                )}
                                            </div>
                                        ))}
                                    </div>

                                    <div className='flex items-center justify-between mt-2'>
                                        <button
                                            type='button'
                                            onClick={() => setStep(1)}
                                            className='flex items-center gap-1 text-sm text-[#7A7A7A] hover:text-[#333] cursor-pointer'
                                        >
                                            <ArrowLeft size={16} /> Back
                                        </button>
                                        <Button
                                            type='button'
                                            onClick={handleSaveCameras}
                                            disabled={isSavingCameras}
                                            className='h-[46px] cursor-pointer px-8 rounded-4xl text-white bg-[#07486a] hover:bg-[#05364f] text-base font-normal'
                                        >
                                            {isSavingCameras
                                                ? <><Loader2 className='animate-spin w-4 h-4 mr-2' />Saving...</>
                                                : 'Save'
                                            }
                                        </Button>
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </Formik>
            </div>

            {previewCam && (
                <CameraPreviewModal cam={previewCam} onClose={() => setPreviewCam(null)} />
            )}
        </div>
    );
};

export default AddNVRForm;
