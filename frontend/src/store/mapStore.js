import { create } from 'zustand';

const useMapStore = create((set) => ({
  selectedReportId: null,
  panTarget: null, // { lat, lng } — watched by MapController to call map.panTo()

  panTo: (lat, lng) => set({ panTarget: { lat, lng } }),
  selectReport: (id) => set({ selectedReportId: id }),
  clearSelection: () => set({ selectedReportId: null, panTarget: null }),
}));

export default useMapStore;
