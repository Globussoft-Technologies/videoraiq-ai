// src/context/AppContext.js
import React, { createContext, useState, useContext, useEffect } from "react";
import { getDepartments, getLocations } from "../../page/user/Dashboard/Api/get";

const DashboardFiltersContext = createContext();

export const DashboardFiltersProvider = ({ children }) => {
  const [selectedDepartment, setSelectedDepartment] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [selectedLocation, setSelectedLocation] = useState([]);
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(false);

  //  Fetch Departments (only once)
   const fetchDepartments = async (filterData) => {
      try {
        setLoading(true);
        // const data = { skip: 0, limit: 20 };
        const data={
          ...filterData,
           "selectedLocations":selectedLocation,
        }
        const result = await getDepartments(data);

        if (result?.status === "success") {
          const deptData = result?.data || [];
          const formattedDepts = deptData.map((dept) => ({
            id: dept._id,
            label: dept.departmentName,
          }));
          setDepartments(formattedDepts);
        }
      } catch (err) {
        console.error("Error fetching departments:", err);
      } finally {
        setLoading(false);
      }
    };
  useEffect(() => {
    fetchDepartments();
  }, []);

  //  Fetch Locations (only once)
  const fetchLocations = async (filterData) => {
      try {
        setLoading(true);
        // const data = { skip: 0, limit: 20 };
        const data={
          ...filterData,
           "departmentIds":selectedDepartment,
        }
        const result = await getLocations(data);
        if (result?.status === "success") {
          const formattedLocations =
            result?.data.map((loc, index) => ({
              id: index,
              label: loc,
            })) || [];
          setLocations(formattedLocations);
        }
      } catch (err) {
        console.error("Error fetching locations:", err);
      } finally {
        setLoading(false);
      }
    };
  useEffect(() => {
    fetchLocations();
  }, []);

  return (
    <DashboardFiltersContext.Provider
      value={{
        selectedDepartment,
        setSelectedDepartment,
        departments,
        selectedLocation,
        setSelectedLocation,
        locations,
        fetchLocations,
        fetchDepartments,
        loading,
      }}
    >
      {children}
    </DashboardFiltersContext.Provider>
  );
};

export const useDashboardFiltersContext = () =>
  useContext(DashboardFiltersContext);
