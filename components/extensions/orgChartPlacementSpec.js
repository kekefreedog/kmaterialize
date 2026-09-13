describe('OrgChart automatic team placement', () => {
  let host;
  let chart;
  beforeEach(() => { host = document.createElement('div'); host.style.width = '1000px'; document.body.append(host); });
  afterEach(() => { chart?.destroy(); chart = null; host.remove(); });
  it('lists all duplicate team IDs and team names', () => {
    expect(() => M.OrgChart.init(host, {data:{teams:[{id:'a',name:'Design'},{id:'a',name:'Lighting'},{id:'b',name:'Production'},{id:'b',name:'Editorial'}],people:[],links:[]}})).toThrowError(/Duplicate team IDs:.*"a".*Design.*Lighting.*"b".*Production.*Editorial/);
  });
  it('places missing coordinates without overlaps and keeps authored coordinates', () => {
    const data = {teams:[{id:'fixed',name:'Fixed',x:0,y:0},{id:'auto',name:'Automatic'},{id:'x',name:'Keep X',x:12},{id:'y',name:'Keep Y',y:0}],people:Array.from({length:8},(_,i)=>({id:String(i),name:'Person '+i,teamId:'fixed'})),links:[]};
    chart = M.OrgChart.init(host,{data,connectable:false});
    const teams = chart.getData().teams;
    expect(teams[0].x).toBe(0); expect(teams[0].y).toBe(0);
    expect(teams[2].x).toBe(12); expect(teams[3].y).toBe(0);
    expect(data.teams[1].x).toBeUndefined();
    const rects = [...host.querySelectorAll('.org-chart-team')].map(el=>el.getBoundingClientRect());
    rects.forEach((a,i)=>rects.slice(i+1).forEach(b=>expect(a.right<=b.left||b.right<=a.left||a.bottom<=b.top||b.bottom<=a.top).toBeTrue()));
    chart.setData({teams:[{id:'new',name:'New'}],people:[],links:[]});
    expect(Number.isFinite(chart.getData().teams[0].x)).toBeTrue();
  });
  it('still rejects explicitly invalid coordinates with the team and axis', () => {
    expect(()=>M.OrgChart.init(host,{data:{teams:[{id:'bad',name:'Bad Team',x:NaN}],people:[],links:[]}})).toThrowError(/Invalid x.*Bad Team.*bad/);
  });
});
