describe('OrgChart custom avatars', () => {
  it('renders custom text and a fitted image with a text fallback', () => {
    const host = document.createElement('div'); document.body.append(host);
    const chart = M.OrgChart.init(host, {connectable:false,data:{teams:[{id:'t',name:'Team'}],people:[
      {id:'a',teamId:'t',name:'Alex Morgan',avatarText:'UX'},
      {id:'b',teamId:'t',name:'Sam Rivera',avatarText:'SR!',avatarImage:'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="80" height="40"/%3E',avatarFit:'contain'},
      {id:'c',teamId:'t',name:'Maya Patel'}
    ],links:[]}});
    try {
      const avatars=host.querySelectorAll('.org-chart-avatar');
      expect(avatars[0].textContent).toBe('UX');
      expect(avatars[2].textContent).toBe('MP');
      const image=avatars[1].querySelector('img');
      expect(getComputedStyle(image).objectFit).toBe('contain');
      expect(image.alt).toBe('');
      expect(image.draggable).toBeFalse();
      image.dispatchEvent(new Event('error'));
      expect(avatars[1].textContent).toBe('SR!');
      expect(chart.getData().people[1].avatarFit).toBe('contain');
    } finally {chart.destroy();host.remove();}
  });
});
