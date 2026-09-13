describe('OrgChart read-only controls', () => {
  it('omits drag and connection controls when their options are disabled', () => {
    const host = document.createElement('div'); document.body.append(host);
    const data = { teams: [{ id:'t', name:'Team' }], people: [{ id:'p', teamId:'t', name:'Person' }], links: [] };
    const chart = M.OrgChart.init(host, { data, editable:false, connectable:false, draggable:false });
    try {
      expect(host.querySelector('.card-drag-handle')).toBeNull();
      expect(host.querySelector('.org-chart-drag-icon')).toBeNull();
      expect(host.querySelector('.org-chart-connect-port')).toBeNull();
      chart.setData(data);
      expect(host.querySelector('.card-drag-handle')).toBeNull();
    } finally { chart.destroy(); host.remove(); }
  });
});
