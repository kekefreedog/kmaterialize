describe('OrgChart independent drag options', () => {
  const cases = [
    [{}, true, true],
    [{draggable:false}, false, false],
    [{draggableTeams:true,draggablePeople:false}, true, false],
    [{draggableTeams:false,draggablePeople:true}, false, true],
    [{draggable:false,draggableTeams:true}, true, false],
    [{draggable:false,draggablePeople:true}, false, true]
  ];
  cases.forEach(([options,teams,people]) => {
    it('applies controls and team keyboard movement for '+JSON.stringify(options), () => {
      const host=document.createElement('div');document.body.append(host);
      const data={teams:[{id:'t',name:'Team',x:100,y:100}],people:[{id:'p',teamId:'t',name:'Person'}],links:[]};
      const chart=M.OrgChart.init(host,{data,connectable:false,...options});
      try {
        const header=host.querySelector('.org-chart-team-handle');
        expect(header.disabled).toBe(!teams);
        expect(!!host.querySelector('.org-chart-drag-icon')).toBe(teams);
        expect(!!host.querySelector('.card-drag-handle')).toBe(people);
        header.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));
        expect(chart.getData().teams[0].x>100).toBe(teams);
        chart.setData(data);
        expect(!!host.querySelector('.card-drag-handle')).toBe(people);
      } finally {chart.destroy();host.remove();}
    });
  });
});
