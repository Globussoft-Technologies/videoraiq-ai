import * as Yup from 'yup';
import { Formik, Form } from 'formik';
import { lazy, Suspense, useState } from 'react';
import { toast } from 'sonner';
import { storageSchema } from './schema/Storage';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { addStorage } from './Api/post/index';
import { updateStorage } from './Api/put/index';
import { useEffect, useRef } from 'react';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/Tooltip';
import { Info, Loader2 } from 'lucide-react';
import { Base64 } from 'js-base64';

const SFTPForm = lazy(() => import('./components/SftpForm'));
const GoogledriveForm = lazy(() => import('./components/GoogledriveForm'));
const S3Form = lazy(() => import('./components/S3Form'));

const AddStorageModal = ({
  trigger,
  onStorageSelect,
  editData = null,
  isOpen: externalIsOpen,
  onOpenChange: externalOnOpenChange,
}) => {
  const [selectedStorage, setSelectedStorage] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const formikRef = useRef();
  const isEditMode = !!editData;

  useEffect(() => {
    if (externalIsOpen !== undefined) {
      setIsOpen(externalIsOpen);
    }
  }, [externalIsOpen]);

  const handleOpenChange = (open) => {
    setIsOpen(open);
    if (externalOnOpenChange) {
      externalOnOpenChange(open);
    }
    if (!open) {
      setSelectedStorage('');
      setShowForm(false);
      if(formikRef.current)
      {
        formikRef.current.resetForm();
        formikRef.current.setTouched({}, false);
      }
    }
  };

  useEffect(() => {
    if (editData) {
      const storageType = editData.type || editData.storageType;
      setSelectedStorage(storageType);
      setShowForm(true);
    }
  }, [editData]);

  
  const storageTypes = [
    // { id: 'google_drive_oauth', name: 'Google Drive' },
    { id: 's3', name: 'Amazon S3' },
    { id: 'sftp', name: 'SFTP' },
  ];

  const handleStorageSelect = (value) => {
    setSelectedStorage(value);
    setShowForm(true);
  };

  const getInitialValues = () => {
    const commonFields = {
      name: editData?.name || '',
      note: editData?.note || '',
      storageType: selectedStorage,
    };

    if (editData) {
      switch (selectedStorage) {
        case 'sftp':
          return {
            ...commonFields,
            path: editData.path || '',
            port: editData.port || '',
            password: '',
            username: editData.username || '',
            host: editData.host || '',
          };
        case 'google_drive_oauth':
          return {
            ...commonFields,
            clientId: editData.clientId || '',
            clientSecret: '',
            redirectUri: editData.redirectUri || '',
          };
        case 's3':
          return {
            ...commonFields,
            accessKeyId: editData.accessKeyId || '',
            secretAccessKey: '',
            bucketName: editData.bucketName || '',
            region: editData.region || '',
          };
        default:
          return commonFields;
      }
    }

    switch (selectedStorage) {
      case 'sftp':
        return {
          ...commonFields,
          path: '',
          port: '',
          password: '',
          username: '',
          host: '',
        };
      case 'google_drive_oauth':
        return {
          ...commonFields,
          clientId: '',
          clientSecret: '',
          redirectUri: '',
        };
      case 's3':
        return {
          ...commonFields,
          accessKeyId: '',
          secretAccessKey: '',
          bucketName: '',
          region: '',
        };
      default:
        return commonFields;
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent
        className="bg-white rounded-[20px] px-4 py-4 2xl:px-6 shadow-xl border border-gray-200 w-full max-w-xl max-h-[95vh] overflow-y-auto top-1/2 left-1/2 translate-x-[-50%] translate-y-[-50%] animate-fade-in animate-fade-in-up"
        closeBtn="[&_svg]:!size-6 [&_svg]:!w-6 [&_svg]:!h-6 mt-5"
      >
        <DialogHeader>
          <DialogTitle className="2xl:text-xl mt-5 text-sm flex items-center justify-center font-[500] text-[#333333]">
            {isEditMode ? 'Edit Storage' : 'Add Storage'}
          </DialogTitle>
        </DialogHeader>

        <div className="py-4">
          {!showForm ? (
            <>
              <label className="block ml-2 text-xs 2xl:text-sm font-[400] text-[#333333] mb-2">
                Select
              </label>
              <Select
                value={selectedStorage}
                onValueChange={handleStorageSelect}
              >
                <SelectTrigger className="w-full border-[#80808059] cursor-pointer text-[#686868] font-[400] text-sm [&_svg]:!h-7 [&_svg]:!w-7 ">
                  <SelectValue placeholder="Select storage type" />
                </SelectTrigger>
                <SelectContent className="border-[#80808059] cursor-pointer">
                  {storageTypes.map((storage) => (
                    <SelectItem
                      key={storage.id}
                      value={storage.id}
                      className="cursor-pointer font-[400] 2xl:text-sm text-xs text-[#686868] hover:bg-gray-100"
                    >
                      {storage.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
          ) : (
            <Formik
              initialValues={getInitialValues()}
              innerRef={formikRef}
              enableReinitialize={true}
              validationSchema={storageSchema}
              onSubmit={async (values, { resetForm }) => {
                try {
                  const selectedStorageData = storageTypes.find(
                    (storage) => storage.id === selectedStorage
                  );

                  const payload = {
                    storageType: selectedStorageData.id,
                    ...values,
                  };
                  if (values.password) {
                    payload.password = Base64.encode(values.password);
                  }

                  if (values.secretAccessKey) {
                    payload.secretAccessKey = Base64.encode(
                      values.secretAccessKey
                    );
                  }
                  
                  let response;
                  if (isEditMode) {
                    response = await updateStorage(editData._id, payload);

                    if (response?.status === 200 || response?.status === 201) {
                      toast.success(response?.data?.body?.message || '');
                    } else if (response?.data?.statusCode === 400) {
                      toast.error(
                        response?.data?.body?.message ||
                          'Something went wrong while updating storage'
                      );
                    }
                  } else {
                    response = await addStorage(payload);

                    if (
                      response?.data?.statusCode === 200 ||
                      response?.data?.statusCode === 201
                    ) {
                      toast.success(response?.data.body?.message || '');
                    } else if (response?.data?.statusCode === 400) {
                      toast.error(
                        response?.data?.body?.message ||
                          'Something went wrong while adding storage'
                      );
                    }
                  }

                  if (selectedStorage === 'google_drive_oauth') {
                    const url = response?.data?.body?.data?.url;
                    if (url) {
                      window.open(url, '_blank');
                    } else if (response?.data?.body?.message) {
                      toast.error(
                        response?.data?.body?.message ||
                          'Something went wrong while adding storage'
                      );
                    }
                  }

                  if (onStorageSelect) {
                    onStorageSelect({
                      ...selectedStorageData,
                      config: values,
                    });
                  }
                  resetForm();
                  setSelectedStorage('');
                  setShowForm(false);
                  handleOpenChange(false);
                } catch (error) {
                  console.error('Unexpected error:', error);

                  if (error?.response?.data?.body?.message) {
                    toast.error(
                      error?.response?.data?.body?.message ||
                        'Something went wrong while adding storage'
                    );
                  }
                }
              }}
              validateOnChange={true}
              validateOnBlur={true}
            >
              {({
                values,
                handleChange,
                handleBlur,
                errors,
                touched,
                setFieldValue,
                isSubmitting,
              }) => (
                <Form className="space-y-4" autoComplete="off">
                  <div>
                    <label className="block ml-2 text-xs 2xl:text-sm font-[400] text-[#333333] mb-2">
                      Select Storage Type
                    </label>
                    <Select
                      value={values.storageType}
                      onValueChange={(val) => {
                        setFieldValue('storageType', val);
                        setSelectedStorage(val);
                        setShowForm(true);
                      }}
                      disabled={isEditMode}
                    >
                      <SelectTrigger className="w-full border-[#80808059] cursor-pointer text-[#686868] font-[400] text-sm [&_svg]:!h-7 [&_svg]:!w-7">
                        <SelectValue placeholder="Select storage type" />
                      </SelectTrigger>
                      <SelectContent className="border-[#80808059] cursor-pointer">
                        {storageTypes.map((storage) => (
                          <SelectItem
                            key={storage.id}
                            value={storage.id}
                            className="cursor-pointer font-[400] 2xl:text-sm text-xs text-[#686868] hover:bg-gray-100"
                          >
                            {storage.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <label className="block ml-2 text-xs 2xl:text-sm font-[400] text-[#333333] mb-2">
                      Name
                    </label>
                    <input
                      type="text"
                      name="name"
                      value={values.name}
                      onChange={handleChange}
                      onBlur={handleBlur}
                      autoFocus="autoFocus"
                      placeholder="Name"
                      className="w-full px-3 py-2 border border-[#80808059] rounded-[10px] text-sm focus:outline-none focus:ring-2 focus:ring-[#07486A] focus:border-transparent"
                    />
                    {errors.name && touched.name && (
                      <div className="text-red-500 text-xs mt-1">
                        {errors.name}
                      </div>
                    )}
                  </div>

                  {selectedStorage === 'sftp' && (
                  
                      <SFTPForm
                        values={values}
                        errors={errors}
                        touched={touched}
                        handleChange={handleChange}
                        handleBlur={handleBlur}
                        isEditMode={isEditMode}
                      />
                  
                  )}

                  {selectedStorage === 'google_drive_oauth' && (
                  
                      <GoogledriveForm
                      values={values}
                      errors={errors}
                      touched={touched}
                      handleChange={handleChange}
                      handleBlur={handleBlur}
                      isEditMode={isEditMode}
                    />
                    
                    
                  )}

                  {selectedStorage === 's3' && (
                  
                      <S3Form
                      values={values}
                      errors={errors}
                      touched={touched}
                      handleChange={handleChange}
                      handleBlur={handleBlur}
                      isEditMode={isEditMode}
                    />
                                    
                  )}

                  <div>
                    <label className="block ml-2 text-xs 2xl:text-sm font-[400] text-[#333333] mb-2">
                      <span className="inline-flex items-center">Note</span>
                    </label>
                    <textarea
                      name="note"
                      value={values.note}
                      onChange={handleChange}
                      onBlur={handleBlur}
                      rows={3}
                      placeholder="Note"
                      className="w-full min-h-[106px] px-3 py-2 border border-[#80808059] rounded-[10px] text-sm focus:outline-none focus:ring-2 focus:ring-[#07486A] focus:border-transparent resize-y"
                    />
                  </div>

                  <div className="flex justify-end gap-3">
                    <Button
                      type="submit"
                      disabled={isSubmitting}
                      className="h-[46px] font-[400] cursor-pointer w-[172px] bg-[#07486A] rounded-4xl text-white transition-colors 2xl:text-base text-sm md:text-lg"
                    >
                        {isSubmitting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    isEditMode ? 'Save Storage' : 'Add Storage'
                  )}
                    </Button>
                  </div>
                </Form>
              )}
            </Formik>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AddStorageModal;
