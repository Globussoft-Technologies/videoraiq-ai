/**
 * Language localization
 *
 * Languages with short code
 *  __________________________________
 * |    LANGUAGE       |     CODE     |
 * |___________________|______________|
 * |    English        |     en       |
 * |    Spanish        |     es       |
 * |    Indonesian     |     idn      |
 * |    French         |     fr       |
 * |    Arabic         |     ar       |
 * |___________________|______________|
 */

//MultiLanguage responses for Admin
export let UserMessageNew = {
    CANNOT_USE_ADMIN_MAIL:{
        en:'Email is already in use for an admin account.'
    },
    USER_CURRENT_PASSWORD_FAIL: {
        en: 'Invalid old Password.',
    },
    EMP_CODE:{
        en:'Employee code already Exist'
    },
    USER_PASSWORD_SUCCESS: {
        en: 'Password Updated Successfully.',
    },
    USER_PASSWORD_FAIL: {
        en: 'Error Updating Password.',
    },
    PASSWORD_RESEND_LIMIT: {
        en: 'Password Re-set mail sent limit reached,Please try next day.'
    },
    PASSWORD_RESEND_MAIL: {
        en: 'Password reset mail send successfully.'
    },
    USERNAME_EXIST: {
        en: 'UserName already exist, please try with other userNames.'
    },
    EMAIL_EXIST: {
        en: 'Email already exist.'
    },
    REVIWER_SIGNUP_SUCCESS: {
        en: 'Reviewer signup success,Please verify the mail.'
    },
    USER_SIGNUP_SUCCESS: {
        en: 'Account created successfully'
    },
    BULK_USER_SIGNUP_SUCCESS: {
        en: 'user account have been successfully created.'
    },
    FAILD_TO_SIGNUP: {
        en: 'Failed to signup'
    },
    EMAIL_NOT_REGISTER: {
        en: 'Email not yet registered.'
    },
    EMAIL_ACTIVATED: {
        en: 'Email already activated!'
    },
    INVALID_TOKEN: {
        en: 'Invalid OTP, please provide valid OTP!.'
    },
    INVALID_EMAIL_TOKEN:{
        en:"The password reset token has expired. Please request a new one."
    },
    TOKEN_EXPIRED: {
        en: "Your OTP has expired. Please log in again to receive a new OTP."
    },
    EMAIL_VERIFICATION_FAILED: {
        en: 'Failed to Verify Email !!'
    },
    USER_ACTIVATION_SUCCESS: {
        en: "User logged in successfully!"
    },
    USER_ACTIVATION_FAILED: {
        en: 'User Activated Failed.!'
    },
    EMAIL_NOT_EXIST: {
        en: 'Email not exist.'
    },
    FAILED_TO_FETCH_DETAILS: {
        en: 'Error in fetch details.'
    },
    EMAIL_NOT_VERIFIED: {
        en: 'Email not verified.'
    },
    INVALID_EMAIL: {
        en: 'Invalid email.'
    },
    INVALID_PASSWORD: {
        en: 'Invalid password.'
    },
    USER_NOT_EXIST: {
        en: 'User does not exist!.'
    },
    SOMETHING_WENT_WRONG: {
        en: 'Something went wrong'
    },
    PASSWORD_RESET: {
        en: 'Password reset successfully.'
    },
    FAILED_TO_RESET_PWD: {
        en: 'Error while resetting password.'
    },
    VERIFY_MAIL_LIMIT_REACHED: {
        en: 'Verification mail sent limit reached, Please try next day.'
    },
    VERIFY_MAIL_SENT: {
        en: 'Verification mail sent successfully.'
    },
    FAILED_TO_GENERATE_TOKEN: {
        en: 'Failed to generate token.'
    },
    NETWORK_VALIDATION: {
        en: 'Please choose the valid network'
    },
    FAILED_SOCIAL_LOGIN: {
        en: 'Failed to login with social account'
    },
    FAILED_GOOGLE_LOGIN: {
        en: 'Error while adding the Google Account, Invalid Token'
    },
    FAILED_FACEBOOK_LOGIN: {
        en: 'Error social Account Adding, Invalid verification code format'
    },
    FAILED_TWITTER_LOGIN: {
        en: 'Error while adding the Twitter Account, Invalid Token'
    },
    USER_FETCH_SUCCESS: {
        en: 'User fetched successfully'
    },
    USER_FETCH_FAILED: {
        en: 'Failed to fetch user details'
    },
    INVALID_INPUT: {
        en: 'Invalid Input,Provide valid image extension or url for Profile Pic'
    },
    USER_UPDATE_SUCCESS: {
        en: 'User updated successfully'
    },
    USER_UPDATE_FAILED: {
        en: 'Failed to update user details'
    },
    USER_ID_NOT_EXIST: {
        en: 'User not found. Please check Provided UserId'
    },
    USER_SUSPEND_SUCCESS: {
        en: 'User suspended successfully'
    },
    USER_ALREADY_SUSPEND: {
        en: 'User is already suspended'
    },
    USER_RESUMED_SUCCESS: {
        en: 'User resumed successfully'
    },
    USER_ALREADY_RESUMED: {
        en: 'User is already resumed'
    },
    FAILED_USER_STATE_UPDATE: {
        en: 'Error in update user state details'
    },
    USER_REWARD_FETCH_SUCCESS: {
        en: 'User rewards details fetched Successfully.',
    },
    USER_REWARD_FETCH_FAILED: {
        en: 'Failed to fetch user rewards.',
    },
    DURATION_ADDED_SUCEESS:{
        en: 'Duration is Added Successfully.'
    },
    FAILED_TO_ADD_DURATION:{
        en: 'Failed to Add Duration.'
    },
    WALLET_ALREADY_EXIST:{
        en: 'Wallet Key already exist.'
    },
    FAILED_TO_UPDATE_USER_DETAILS:{
        en:'Failed to Update User Details!.'
    },
    INVALID_DOCUMENT:{
        en:'Only image files (jpg, jpeg, png, gif, webp) are allowed.'
    },
    INVALID_FILES:{
        en:'Only ZIP, PDF, JPEG, PNG, GIF, WEBP, JPG, SVG, BMP, TIFF, ICO, AVIF, and APNG files are allowed.'
    },
    USER_NOT_FOUND:{
        en:'User not found or could not be updated.'
    },
    USER_UPDATED:{
        en:'User updated successfully'
    },
    USER_UPDATE_FAILED:{
        en:'Failed to update user details'
    },
    ADMIN_NOT_FOUND:{
        en:'Admin does not Exists!.'
    },
    USER_DELETED_SUCCESSFULLY:{
        en:'User deleted successfully.'
    },
    USER_DELETED_FAILED:{
        en:'User delete Failed!'
    },
    ROLE_NOT_EXIST:{
        en:"The default employee role does not exist. To assign a role to the deleted user, please create a new employee role."
    },
    INVALID_USER_IS:{
        en:"Invalid userId format"
    },
    USER_RESTORED_SUCCESSFULLY:{
        en:"User Restored Successfully."
    },
    USER_RESTORE_FAILED: {
        en: "Failed to restore the user."
    },
    FAILED_TO_FETCH_USER_DETAILS:{
        en:"Failed to Fetch Admin Details"
    },
    IDENTICAL_NEW_AND_CURRENT_PASSWORD:{
        en:'The new password cannot be identical to the current password. Kindly provide a unique password.'
    }
};

export let dashboard = {
    SUCCESSFULLY_FETCHED_DASHBOARD_EMPLOYEES_STATS:{
        en:'Successfully fetched Dashboard Employees Stats.'
    },
    FAILED_TO_FETCH_DASHBOARD_DATA:{
        en:'Failed to Fetch Dashboard Employees Stats.'
    }
};

export let columnPermissions = {
    USERS_NOT_FOUND:{
        en:'User does not exist,Please provide valid userId'
    },
    SUCCESSFULLY_FETCHED_COLUMN_PERMISSIONS:{
        en:'Successfully fetched columnPermissions.'
    },
    SUCCESSFULLY_UPDATED_COLUMN_PERMISSIONS:{
        en:'Successfully fetched columnPermissions.'
    },
    FAILED_TO_FETCH_COLUMN_PERMISSIONS:{
        en:'Failed to fetch column permissions'
    },
    FAILED_TO_UPDATE_COLUMN_PERMISSIONS:{
        en:'Failed to update column permissions'
    }
}

export let AdminMessageNew = {
    INVALID_DOCUMENT:{
        en:'Only image files (jpg, jpeg, png, gif, webp) are allowed.'
    },
    ADMIN_CREATE:{
        en:'Admin Registered Successfully!'
    },
    ADMIN_CURRENT_PASSWORD_FAIL: {
        en: 'Invalid Current Password.',
    },
    ADMIN_PASSWORD_SUCCESS: {
        en: 'Password Updated Successfully.',
    },
    ADMIN_PASSWORD_FAIL: {
        en: 'Error Updating Password.',
    },
    PASSWORD_RESEND_LIMIT: {
        en: 'Password Re-set mail sent limit reached,Please try next day.'
    },
    PASSWORD_RESEND_MAIL: {
        en: 'Password reset mail sent successfully.'
    },
    ADMINNAME_EXIST: {
        en: 'AdminName already exist, please try with other userNames.'
    },
    EMAIL_EXIST: {
        en: 'Email already exist.'
    },
    REVIWER_SIGNUP_SUCCESS: {
        en: 'Reviewer signup success,Please verify the mail.'
    },
    ADMIN_SIGNUP_SUCCESS: {
        en: 'Admin signup success,Please verify the mail.'
    },
    FAILD_TO_SIGNUP: {
        en: 'Failed to signup'
    },
    EMAIL_NOT_REGISTER: {
        en: 'Email not yet registered.'
    },
    EMAIL_ACTIVATED: {
        en: 'Email already activated!'
    },
    INVALID_TOKEN: {
        en: 'Invalid Activation token!.'
    },
    TOKEN_EXPIRED: {
        en: 'Your Token has expired, please re-generated the email verify token.'
    },
    EMAIL_VERIFICATION_FAILED: {
        en: 'Failed to Verify Email !!'
    },
    ADMIN_ACTIVATION_SUCCESS: {
        en: 'Admin Activated successfully.!'
    },
    ADMIN_ACTIVATION_FAILED: {
        en: 'Admin Activated Failed.!'
    },
    EMAIL_NOT_EXIST: {
        en: 'Email not exist.'
    },
    FAILED_TO_FETCH_DETAILS: {
        en: 'Error in fetch details.'
    },
    EMAIL_NOT_VERIFIED: {
        en: 'Email not verified.'
    },
    INVALID_EMAIL: {
        en: 'Invalid email.'
    },
    INVALID_PASSWORD: {
        en: 'Invalid password.'
    },
    ADMIN_NOT_EXIST: {
        en: 'Admin does not exist.'
    },
    SOMETHING_WENT_WRONG: {
        en: 'Something went wrong'
    },
    PASSWORD_RESET: {
        en: "Your password has been reset successfully."
    },
    FAILED_TO_RESET_PWD: {
        en: 'Error while resetting password.'
    },
    VERIFY_MAIL_LIMIT_REACHED: {
        en: 'Verification mail sent limit reached, Please try next day.'
    },
    VERIFY_MAIL_SENT: {
        en: 'Verification mail sent successfully.'
    },
    FAILED_TO_GENERATE_TOKEN: {
        en: 'Failed to generate token.'
    },
    NETWORK_VALIDATION: {
        en: 'Please choose the valid network'
    },
    FAILED_SOCIAL_LOGIN: {
        en: 'Failed to login with social account'
    },
    FAILED_GOOGLE_LOGIN: {
        en: 'Error while adding the Google Account, Invalid Token'
    },
    FAILED_FACEBOOK_LOGIN: {
        en: 'Error social Account Adding, Invalid verification code format'
    },
    FAILED_TWITTER_LOGIN: {
        en: 'Error while adding the Twitter Account, Invalid Token'
    },
    ADMIN_FETCH_SUCCESS: {
        en: 'Admin fetched successfully'
    },
    ADMIN_FETCH_FAILED: {
        en: 'Failed to fetch admin details'
    },
    INVALID_INPUT: {
        en: 'Invalid Input,Provide valid image extension or url for Profile Pic'
    },
    ADMIN_UPDATE_SUCCESS: {
        en: 'Admin updated successfully'
    },
    ADMIN_UPDATE_FAILED: {
        en: 'Failed to update admin details'
    },
    ADMIN_ID_NOT_EXIST: {
        en: 'Admin not found. Please checked Provided UserId'
    },
    ADMIN_SUSPEND_SUCCESS: {
        en: 'Admin suspended successfully'
    },
    ADMIN_ALREADY_SUSPEND: {
        en: 'Admin is already suspended'
    },
    ADMIN_RESUMED_SUCCESS: {
        en: 'Admin resumed successfully'
    },
    ADMIN_ALREADY_RESUMED: {
        en: 'Admin is already resumed'
    },
    FAILED_ADMIN_STATE_UPDATE: {
        en: 'Error in update Admin state details'
    },
    ADMIN_REWARD_FETCH_SUCCESS: {
        en: 'Admin rewards details fetched Successfully.',
    },
    ADMIN_REWARD_FETCH_FAILED: {
        en: 'Failed to fetch admin rewards.',
    },
    DURATION_ADDED_SUCEESS:{
        en: 'Duration is Added Successfully.'
    },
    FAILED_TO_ADD_DURATION:{
        en: 'Failed to Add Duration.'
    },
    ADMIN_DETAILS_FETCHED:{
        en:'Successfully fetched Admin details'
    },
    FAILED_TO_FETCH_ADMIN_DETAILS:{
        en:'Failed to Fetch Admin Details'
    },
    OLD_PASSWORD_MISMATCH:{
        en:'Old password is incorrect. Please provide a valid old password.'
    },
    SAME_NEW_PASSWORD: {
        en: 'The new password cannot be identical to the current password. Kindly provide a unique password.'
    }     

};

export let commonMessage = {
    SUCCESS:{
        en:'Success'
    },
    COMMON_ERROR: {
        en: 'Error Found: ',
    },
    VALIDATION_FAILED: {
        en: 'Validation Failed!.',
    },
    USER_ID_NOT_EXIST: {
        en: 'User Id not found. Please check provided user Id.'
    },
    USERNAME_FOUND:{
        en:'User not found. Please provide valid username'
    },
    ADMIN_NOT_FOUND:{
        en:'Admin does not exist!'
    },
    SOMETHING_WENT_WRONG:{
        en:'Something went wrong!'
    }
};



//Multilanguage responses for Roles
export let RolesMessageNew = {
    VALIDATION_FAIL: {
        en: 'Validation failed.',
    },
    'COLLECTION_SEARCH-FAILED': {
        en: 'Collection is not present in the database.',
    },
    ROLES_ADD_SUCCESS: {
        en: 'Roles created successfully.',
    },
    ROLES_EXIST: {
        en: 'The specified role already exists for the given admin. Please choose a different role.',
    },
    ROLES_CAPACITY: {
        en: 'Adding roles capacity is already reached.',
    },
    ROLES_FOUND: {
        en: 'Invalid Role ID.',
    },
    ROLES_ADD_FAIL: {
        en: 'Error creating roles.',
    },
    ROLES_FETCH_SUCCESS: {
        en: 'Roles fetched successfully.',
    },
    ROLES_FETCH_FAIL: {
        en: 'Unable to fetch roles from this Admin.',
    },
    ROLES_FETCH_FAILED: {
        en: 'Unable to fetch roles please check with ID.',
    },
    ROLES_UPDATE_FAIL: {
        en: 'This roleName is already present, unable to update roleName.',
    },
    ROLES_DEFAULT_FAIL: {
        en: "Can't update default role.",
    },
    ROLES_DEFAULT_FAILED: {
        en: "Updating default roles is not allowed. Please select a different role to modify.",
    },
    ROLES_UPDATE_SUCCESS: {
        en: 'Successfully updated.',
    },
    DELETE_DEFAULT_FAIL: {
        en: "Default roles cannot be deleted. Please choose a non-default role to remove.",
    },
    DELETE_FAIL_USER: {
        en: "Can't delete role, this role is assigned to some users/temporary deleted users.",
    },
    DELETE_ALL_FAIL: {
        en: 'There is no roles present except default roles.',
    },
    DELETE_ALL_USERFAIL: {
        en: "Can't delete default and assigned roles.",
    },
    DELETE_SUCCESS: {
        en: 'Roles deleted successfully.',
    },
    PLEASE_PROVIDE_ROLE_NAME: {
        en: 'Please enter role name.',
    },
    PLEASE_PROVIDE_PERMISSION_NAME: {
        en: 'Please enter permission name.',
    },
    FAILED_FETCH_ROLE: {
        en: 'Unable to fetch roles please check role name.',
    },
    ROLE_SEARCH: {
        en: 'Search result.',
    },
    ROLE_SEARCH_FAIL: {
        en: 'Failed to search.',
    },
    FEATURE_NOT_ENABLED: {
        en: 'feature is not enabled',
    },
    ROLE_PLAN_LIMIT: {
        en: 'Roles adding limit is reached in your plan, please upgrade your plan.',
    },
    FAILED_FETCH_PERMISSION: {
        en: 'Unable to match permission please check permission name.',
    },
    FIELD_NOT_SELECTED: {
        en: 'Select atleast one filter',
    },
    ADMIN_NOT_EXIST:{
        en:'Admin not exist.'
    },
    ROLE_NOT_EXIT:{
        en:`Provided role doesn't exit`
    },
    ROLES_NOT_FOUND:{
        en:'Roles not found!'
    },
    ROLES_NAME_UPDATE_FAIL:{
        en:"Cannot update RoleName for default Role!"
    }
};


export let PermissionMessageNew = {
    USER_NOT_FOUND:{
        en:'User does not exist!'
    },
    FEATURE_NOT_ENABLED: {
        en: 'feature is not enabled.',
    },
    VALIDATION_FAIL: {
        en: 'Validation failed.',
    },
    DELETE_FAIL_USER: {
        en: "Can't delete permission, this permission is assigned to some users.",
    },
    PERMISSION_FETCH_SUCCESS: {
        en: 'Permissions fetched successfully.',
    },
    ADMIN_NOT_EXIST: {
        en: 'Admin not exist.'
    },
    FETCH_ERROR:{
        en: 'Error Fetching Permission.',
    },
    PERMISSION_INVALID_ID:{
        en:'Invalid PermissionId .Please provide valid permissionId!',
    },
    PERMISSIONS_UPDATED:{
        en:'Permissions Updated Successfully.',
    },
    PERMISSION_NOT_FOUND:{
        en:'Permission not Available!,Please check permissionId',
    },
    UPDATE_DEFAULT_PERMISSIONS:{
        en:'Cannot Update Default Permissions!'
    },
    DELETE_DEFAULT_PERMISSIONS:{
        en:'Cannot Delete Default Permissions!'
    },
    DELETE_PERMISSIONS:{
        en:'Permissions deleted successfully',
    },
    ROLES_PERMISSION_FETCHED:{
        en:'Roles and their Permissions Fetched Successfully'
    },
    PERMISSION_CREATION_FAILED:{
        en:'Error creating permissions.'
    },
    ADMIN_VIEW:{
        en:'Only Admin can view all the Permissions!'
    },
    NO_DATA_FOUND:{
        en:'No data found'
    },
    NO_ADMIN_USERS_FOUND:{
        en:'No Users found for this Admin!.'
    },
    BULK_UPDATE_SUCCESS:{
        en:"Bulk permission configuration update successful!"
    },
    BULK_UPDATE_FAILED:{
        en:'Bulk update Failed!'
    },
    NO_PERMISSION_CONFIG_PROVIDED:{
        en:'No permission configurations provided for deletion'
    },
    PERMISSION_CONFIG_DELETE_SUCCESS:{
        en:'Bulk permission configuration deletion successful!'
    },
    PERMISSION_CONFIG_DELETE_UNSUCCESSFUL:{
        en:'No permissions were deleted, possibly due to non-matching moduleNames.'
    },
    PERMISSION_CONFIG_DELETE_ERROR:{
        en:'Error in deleting permission Config!'
    }
};

export let teamsMessagesNew = {
    DUPLICATE_TEAM_NAME:{
        en:'Duplicate TeamName , Team Name Already Present!'
    },
    INVALID_USER_IDS:{
        en:'Please provide a valid user ID array.'
    },
    ALREADY_ASSIGNED_USER_ID:{
        en:'User Id already assigned in a team'
    },
    TEAM_CREATED:{
        en:'Successfully created team'
    },
    TEAM_CREATION_FAILED:{
        en:'Failed to create team'
    },
    SUCCESSFULLY_FETCHED_TEAM:{
        en:'Successfully fetch the teams'
    },
    FAILED_TO_FETCH_TEAM:{
        en:'Failed to fetch the teams'
    },
    ADMIN_NOT_EXIST:{
        en:'Admin does not Exist!'
    },
    VALID_TEAM_ID:{
        en:'Please provide valid teamId'
    },
    USER_NOT_EXIST:{
        en:'Provided UserId is Invalid, Please provide valid userId!'
    },
    TEAM_UPDATE_SUCCESSFUL:{
        en:'Team updated successfully'
    },
    FAILED_TO_UPDATE_TEAM:{
        en:'Failed to update teams'
    },
    TEAM_WITH_ID_NOT_EXIST:{
        en:'Team does not exist for the given teamId!'
    },
    TEAM_DELETE_SUCCESSFUL:{
        en:'Team deleted successfully'
    },
    FAILED_TO_DELETE_TEAM:{
        en:'Failed to Delete Team!'
    }
};

export let IpAccessMessages = {
    ADMIN_NOT_FOUND:{
        en:'Admin not found. It may be deleted or credentials are invalid.'
    },
    IP_BLOCKED:{
        en:'Access denied. IP address is blocked.'
    },
    ACCESS_DENIED:{
        en:'Access denied. Invalid IP address.'
    },
    ERROR_IN_CATCH:{
        en:'Internal server error.'
    },
    IP_NOT_FOUND:{
        en:'Missing IP Address! Please provide valid ipAddress'
    },
    IP_NOT_EXIST:{
        en:'IP address not exist'
    },
    IP_NOT_ALLOWED:{
        en:'Access denied. IP address not allowed!'
    }
};

export let practiceMessages = {
    PRACTICE_CREATED:{
        en:'Successfully created Practice'
    },
    PRACTICE_CREATION_FAILED:{
        en:'Failed to create practice'
    },
    FETCH_PRACTICE_SUCCESS:{
        en:'Successfully fetched practice data'
    },
    FAILED_TO_FETCH_PRACTICE_DATA:{
        en:'Failed to fetch Practice data'
    },
    PRACTICE_NOT_EXIST:{
        en:'PracticeID not exist'
    },
    INVALID_PRACTICE_ID:{
        en:'Please provide PracticeID'
    },
    UPDATED_PRACTICE_ID:{
        en:'Practice updated successfully'
    },
    FAILED_TO_UPDATE_PRACTICE:{
        en:'Failed to update Practice!'
    },
    PRACTICE_DELETE_SUCCESS:{
        en:'Practice deleted successfully'
    },
    PRACTICE_SHEET_DELETE_SUCCESS:{
        en:'deleted successfully'
    },
    ADMIN_NOT_FOUND:{
        en:'Invalid Admin,Admin does not exist!'
    }
};

export let PermissionMiddlewareMessage = {
    ACCESS_DENIED: {
        en: 'You are not allowed to access this route.',
    },
    FAILED_ACCESS: {
        en: 'Permission not added. Please contact your admin.',
    },
    VIEW_ACCESS_DENIED:{
        en:'You do not have permission to view'
    },
    CREATE_ACCESS_DENIED:{
        en:'You do not have permission to create'
    },
    EDIT_ACCESS_DENIED:{
        en:'You do not have permission to edit'
    },
    DELETE_ACCESS_DENIED:{
        en:'You do not have permission to delete'
    }
};

export let autoEmailReportMessages = {
    INVALID_ADMIN:{
        en:'Admin not found, Invalid Admin!'
    },
    DUPLICATE_TITLE:{
        en:'This title with report already present.'
    },
    MINIMUM_USER_REQUIRED:{
        en:'Minimum one user required.'
    },
    MINIMUM_CONTENT_REQUIRED:{
        en:'Minimum one Content required.'
    },
    MINIMUM_ONE_SEND_TO_FILTER_REQUIRED:{
        en:'Minimum one ReportsType option required, to send data!.'
    },
    REPORT_STORED_SUCCESSFULLY:{
        en:'Information Stored successfully'
    },
    ERROR_STORING_DATA:{
        en:'Error while creating data'
    },
    FAILED_TO_CREATE:{
        en:'Failed to store Data'
    },
    INFORMATION_FETCH_SUCCESS:{
        en:'Information Fetched successfully'
    },
    ERROR_FETCHING_DATA:{
        en:'Error while fetching data'
    },
    FAILED_TO_FETCH_DATA:{
        en:'Failed to Fetch Data'
    },
    REPORT_NOT_FOUND:{
        en:'Document not found.'
    },
    UPDATE_SUCCESSFUL:{
        en:'Document updated successfully'
    },
    ERROR_UPDATING_REPORT:{
        en:'Error while updating report'
    },
    FAILED_TO_UPDATE:{
        en:'Failed to update report'
    },
    DELETE_SUCCESSFUL:{
        en:'Data deleted successfully'
    },
    ERROR_IN_DELETING:{
        en:'Error while deleting data'
    },
    FAILED_TO_DELETE:{
        en:'Failed to delete Data'
    },
    UNSUPPORTED_FREQ:{
        en:'Unsupported frequency:'
    },
    WHOLE_ORG_ERROR:{
        en:'Error processing content for whole organization: '
    },
    SPECIFIC_USER_ERROR:{
        en:'Error processing content for specific organizations: '
    },
    ERROR_PROCESSING_DOCUMENT_FOR_ADMIN_ID:{
        en:'Error processing document for adminId '
    },
    ERROR_IN_SENDING_REPORT:{
        en:'Error in sending Report:'
    },
    ERROR_GENERATING_EXCEL_RECORD:{
        en:'Error generating Excel for record'
    },
    ERROR_GENERATING_CSV_RECORD:{
        en:'Error generating CSV for record'
    },
    ERROR_SENDING_EMAIL:{
        en:'Error sending email to'
    }

}

export let locationMessages = {
    VALIDATION_FAILED:{
        en:'Validation Failed!'
    },
    LOCATION_CREATED:{
        en:'Location Created Successfully!'
    },
    LOCATION_ALREADY_EXISTS:{
        en:'Location details already present!'
    },
    SUCCESSFULLY_FETCHED_LOCATIONS:{
        en:'Locations Fetched Successfully.'
    },
    NO_LOCATIONS_FOUND:{
        en:'Unable to fetch Locations!'
    },
    LOCATION_NOT_EXIST:{
        en:"Location not exist"
    },
    LOCATION_UPDATED_SUCCESSFULLY:{
        en:'Location updated successfully'
    },
    ERROR_UPDATING_LOCATION:{
        en:'Error while update location'
    },
    INVALID_LOCATION_ID:{
        en:'Please provide valid location id'
    },
    SUCCESSFULLY_DELETED_LOCATION:{
        en:'Successfully delete location'
    },
    ERROR_DELETING_LOCATION:{
        en:'Error while deleting Location'
    }
}

export let recordMessages = {
    INVALID_FILE:{
        en:'Please provide a file to upload'
    },
    ONE_FILE_REQUIRED:{
        en:'Please upload only one file'
    },
    UNSUPPORTED_FILE:{
        en:'Unsupported file format'
    },
    Invalid_PRACTICE_ID:{
        en:'PracticeID not exist'
    },
    SUCCESSFULLY_UPLOADED:{
        en:'Records uploaded Successfully'
    },
    FAILED_TO_UPLOAD_RECORDS:{
        en:'Failed to Upload Records!'
    },
    INVALID_DATE_FORMAT_FOR_CREATED_AT:{
        en:'Provide both startDate and endDate to filter by Date in createdAt.'
    },
    INVALID_DATE_FORMAT_FOR_DOS:{
        en:'Provide both startDate and endDate to filter by Date in DOS.'
    },
    INVALID_DATE_FORMAT_FOR_WORK_DATE:{
        en:'Provide both startDate and endDate to filter by Date in workDate.'
    },
    INVALID_DATE_FORMAT_FOR_FOLLOW_UP_DATE:{
        en:'Provide both startDate and endDate to filter by Date in followUp_Date.'
    },
    RECORDS_FETCHED:{
        en:'Records Fetched Successfully'
    },
    ERROR_FETCHING_RECORDS:{
        en:'Error while fetching records'
    },
    NO_TEAM_ATTACH_WITH_THIS_PRACTICE:{
        en:'No team attach with this practice!'
    },
    NO_DOCUMENT_FOUND:{
        en:'Document not found please add valid document id'
    },
    NO_DOCUMENT_WITH_PRACTICE:{
        en:'Document not found with given PracticeID'
    },
    COMMENT_ALREADY_EXIST:{
        en:'You already commented on this document please check..!'
    },
    COMMENTS_ADDED_SUCCESSFULLY:{
        en:'Successfully added comment'
    },
    ERROR_ADDING_COMMENTS:{
        en:'Error while adding comment'
    },
    COMMENT_FETCH_SUCCESSFULLY:{
        en:'Successfully fetch comments'
    },
    ERROR_FETCH_COMMENTS:{
        en:'Error while fetching comment'
    },
    RECORDS_UPDATED_SUCCESSFULLY:{
        en:"Record updated successfully"
    },
    DATE_VALIDATION_FAILED:{
        en:"Follow_up_date cannot be less than workDate!"
    },
    STATUS_DETAILS_NOT_FOUND:{
        en:'Status details not found!.'
    },
    SUB_STATUS_DETAILS_NOT_FOUND:{
        en:'subStatus details not found or the subStatus is not related to provided statusDetails!.'
    }
}

export let commentMessage={
    CREATE_COMMENT:{
        en:"comment added successfully"
    },
    COMMENT_ERROR:{
        en:'Error while adding comment'
    },
    COMMENT_UPDATE:{
        en:'Successfully update the comment'
    },
    COMMENT_UPDATE_ERROR:{
        en:'Error while updating comment'
    },
    RECORD_DOES_NOT_EXIST:{
        en:'Record does not exist!'
    },
    COMMENTS_FETCHED:{
        en:'Comments fetched successfully!'
    },
    COMMENT_GET_ERROR:{
        en:'Error fetching comments'
    }
}

export let statusMessages = {
    ADMIN_NOT_EXIST:{
        en:'Admin not exist.'
    },
    ERROR_CREATING_STATUS:{
        en:'Error creating status'
    },
    ERROR_FETCHING_STATUS:{
        en:'Error fetching status'
    },
    ERROR_UPDATING_STATUS:{
        en:'Error updating status'
    },
    ERROR_DELETING_STATUS:{
        en:'Error deleting status'
    },
    STATUS_NOT_FOUND:{
        en:'Status not found!,Please select valid status'
    },
    DUPLICATE_MESSAGES:{
        en:'Status Name already exist, please give different statusName!'
    },
    SUCCESSFULLY_CREATED_STATUS:{
        en:'Successfully created status'
    },
    SUCCESSFULLY_FETCHED_STATUS:{
        en:'Successfully fetched status'
    },
    SUCCESSFULLY_UPDATED_STATUS:{
        en:'Successfully Updated status'
    },
    SUCCESSFULLY_DELETED_STATUS:{
        en:'Successfully Deleted status and its subStatuses'
    },
    STATUS_NOT_EXIST:{
        en:'Status not found!.Please check status'
    },
    RECORD_DOES_NOT_EXIST:{
        en:'Record does not exist!'
    },
    ERROR_CREATING_STATUS_SUB_STATUS:{
        en:'Error Creating status and subStatus'
    },
    SUCCESSFULLY_CREATED_STATUS_AND_ITS_SUB_STATUS:{
        en:'Successfully created status and Its subStatuses'
    },
    ERROR_UPDATING_STATUS_SUB_STATUS:{
        en:'Error Updating status and subStatus'
    },
    DUPLICATE_SUB_STATUS_NAMES:{
        en:'Duplicate subStatus Names!.'
    },
    SUCCESSFULLY_UPDATED_STATUS_AND_ITS_SUB_STATUS:{
        en:'Successfully updated status and its subStatus.'
    },
    PRACTICE_STATUS_FETCHED_SUCCESSFULLY:{
        en:'Practice status and its subStatus fetched successfully'
    },
    ERROR_FETCHING_SUB_STATUS_LIST:{
        en:'Error Fetching Sub Status List.'
    },
    SUCCESSFULLY_FETCHED_ALL_SUB_STATUS_LIST:{
        en:'Successfully fetched subStatus List.'
    }
    
}

export let subStatusMessages = {
    ADMIN_NOT_EXIST:{
        en:'Admin not exist.'
    },
    ERROR_CREATING_STATUS:{
        en:'Error creating subStatus'
    },
    ERROR_FETCHING_STATUS:{
        en:'Error fetching subStatus'
    },
    ERROR_UPDATING_STATUS:{
        en:'Error updating subStatus'
    },
    ERROR_DELETING_STATUS:{
        en:'Error deleting subStatus'
    },
    STATUS_NOT_FOUND:{
        en:'subStatus not found!,Please select valid subStatus'
    },
    DUPLICATE_MESSAGES:{
        en:'subStatusName Name already exist, please give different subStatusName!'
    },
    SUCCESSFULLY_CREATED_STATUS:{
        en:'Successfully created subStatus'
    },
    SUCCESSFULLY_FETCHED_STATUS:{
        en:'Successfully fetched subStatus'
    },
    SUCCESSFULLY_UPDATED_STATUS:{
        en:'Successfully Updated subStatus'
    },
    SUCCESSFULLY_DELETED_STATUS:{
        en:'Successfully Deleted subStatus'
    },
    RECORD_DOES_NOT_EXIST:{
        en:'Record does not exist or subStatus does not match with the status in the Record!'
    },
    SUB_STATUS_NOT_FOUND:{
        en:'subStatus not found!, Please provide valid subStatusId'
    }
    
}

export let KPI_Utility = {
    DATE_VALIDATION_FAILED:{
        en:'Start date must be before end date.'
    },
    SUCCESSFULLY_FETCHED_MONTHLY_KPI:{
        en:'Successfully fetch all Monthly reports'
    },
    FAILED_TO_FETCH_KPI_MONTHLY_RESULT:{
        en:'Failed to fetch Monthly reports!'
    },
    SUCCESSFULLY_FETCHED_PATIENT_KPI_DATE:{
        en:'Successfully fetched PatientKPI data.'
    },
    FAILED_TO_FETCH_PATIENT_KPI:{
        en:'Failed to fetch PatientKPI data!'
    },
    SUCCESSFULLY_FETCHED_INSURANCE_RESULT:{
        en:'Successfully fetched InsuranceKPI data.'
    },
    FAILED_TO_FETCH_INSURANCE_RESULT:{
        en:'Failed to fetch InsuranceKPI data!'
    },
    SUCCESSFULLY_FETCHED_AGING_DATA:{
        en:'Successfully fetched Aging data.'
    },
    FAILED_TO_FETCH_AGING_DATA:{
        en:'Failed to fetch Aging data!'
    },
    SUCCESSFULLY_FETCHED_AGING_INSURANCE_KPI_DATA:{
        en:'Successfully fetched above 30 reports.'
    },
    FAILED_TO_FETCH_AGING_INSURANCE_KPI_DATA:{
        en:'AGING_INSURANCE_KPI_DATA.!'
    },
    NO_PRACTICE_ASSIGNED_TO_TEAM:{
        en:'No practice assigned with the team'
    },
    INVALID_PRACTICE_IDS:{
        en:'None of the provided PracticeIDs exist in the records. for this team'
    }
}

export let activityMessages ={
    ACTIVITY_CREATED: {
        en: 'Successfully signed out from the system.'
    },    
    ACTIVITY_CREATION_FAILED:{
        en:'Failed to create activity!.'
    },
    ACTIVITY_FETCHED:{
        en:"Activity Fetched succssfully."
    },
    FAILED_TO_FETCH_ACTIVITY:{
        en:'Failed to fetch'
    }
}

