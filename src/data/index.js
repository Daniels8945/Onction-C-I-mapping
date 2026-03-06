// ─────────────────────────────────────────────────────────────
//  Nigeria GIS — Static Data
//  C&I data sourced from NERC Market Participants Contact List.
//  Coordinates are state-centroid based (jittered to avoid overlap).
// ─────────────────────────────────────────────────────────────

export const DISCOS = [
  { id: "AEDC",   name: "Abuja DisCo",          lat: 9.05,  lng: 7.49,  states: "FCT, Kogi, Niger, Nasarawa",               customers: "600K+", capacity: "1,095 MW", color: "#f5a623" },
  { id: "BEDC",   name: "Benin DisCo",           lat: 6.33,  lng: 5.62,  states: "Edo, Delta, Ondo, Ekiti",                  customers: "530K+", capacity: "900 MW",   color: "#e05252" },
  { id: "EKEDC",  name: "Eko DisCo",             lat: 6.45,  lng: 3.38,  states: "Lagos South",                              customers: "800K+", capacity: "1,400 MW", color: "#00e5a0" },
  { id: "EEDC",   name: "Enugu DisCo",           lat: 6.45,  lng: 7.51,  states: "Enugu, Anambra, Imo, Abia, Ebonyi",       customers: "780K+", capacity: "1,150 MW", color: "#3b82f6" },
  { id: "IBEDC",  name: "Ibadan DisCo",          lat: 7.38,  lng: 3.90,  states: "Oyo, Ogun, Osun, Kwara",                  customers: "1.2M+", capacity: "1,600 MW", color: "#f59e0b" },
  { id: "IKEDC",  name: "Ikeja DisCo",           lat: 6.60,  lng: 3.35,  states: "Lagos North",                              customers: "800K+", capacity: "1,200 MW", color: "#10b981" },
  { id: "JEDC",   name: "Jos DisCo",             lat: 9.92,  lng: 8.89,  states: "Plateau, Benue, Taraba, Gombe",            customers: "280K+", capacity: "550 MW",   color: "#6366f1" },
  { id: "KAEDCO", name: "Kaduna DisCo",          lat: 10.52, lng: 7.43,  states: "Kaduna, Kebbi, Sokoto, Zamfara",           customers: "450K+", capacity: "800 MW",   color: "#ec4899" },
  { id: "KEDCO",  name: "Kano DisCo",            lat: 12.00, lng: 8.52,  states: "Kano, Katsina, Jigawa",                    customers: "640K+", capacity: "850 MW",   color: "#14b8a6" },
  { id: "PHEDC",  name: "Port Harcourt DisCo",   lat: 4.82,  lng: 7.04,  states: "Rivers, Bayelsa, Akwa Ibom, Cross River", customers: "500K+", capacity: "960 MW",   color: "#8b5cf6" },
  { id: "YEDC",   name: "Yola DisCo",            lat: 9.20,  lng: 12.48, states: "Adamawa, Borno, Yobe",                     customers: "185K+", capacity: "400 MW",   color: "#f97316" },
];

export const GENCOS = [
  { id: "egbin",       name: "Egbin Power",      type: "Thermal", lat: 6.58,  lng: 3.70,  capacity: 1320, fuel: "Gas",   owner: "Sahara Power" },
  { id: "kainji",      name: "Kainji Hydro",     type: "Hydro",   lat: 9.86,  lng: 4.59,  capacity: 760,  fuel: "Water", owner: "TCN/NBET" },
  { id: "jebba",       name: "Jebba Hydro",      type: "Hydro",   lat: 9.13,  lng: 4.83,  capacity: 578,  fuel: "Water", owner: "TCN/NBET" },
  { id: "shiroro",     name: "Shiroro Hydro",    type: "Hydro",   lat: 10.10, lng: 6.79,  capacity: 600,  fuel: "Water", owner: "TCN/NBET" },
  { id: "ughelli",     name: "Ughelli Power",    type: "Thermal", lat: 5.50,  lng: 6.00,  capacity: 972,  fuel: "Gas",   owner: "Transcorp" },
  { id: "sapele",      name: "Sapele Power",     type: "Thermal", lat: 5.90,  lng: 5.67,  capacity: 1020, fuel: "Gas",   owner: "Transcorp" },
  { id: "afam",        name: "Afam VI",          type: "Thermal", lat: 4.85,  lng: 7.22,  capacity: 624,  fuel: "Gas",   owner: "SPDC/NBET" },
  { id: "geregu",      name: "Geregu Power",     type: "Thermal", lat: 7.74,  lng: 6.56,  capacity: 414,  fuel: "Gas",   owner: "AMNI Petroleum" },
  { id: "olorunsogo",  name: "Olorunsogo",       type: "Thermal", lat: 7.00,  lng: 3.27,  capacity: 726,  fuel: "Gas",   owner: "Mainstream Energy" },
  { id: "omotosho",    name: "Omotosho",         type: "Thermal", lat: 6.43,  lng: 4.67,  capacity: 500,  fuel: "Gas",   owner: "Amni Intl" },
  { id: "azura",       name: "Azura-Edo IPP",    type: "Thermal", lat: 6.58,  lng: 5.50,  capacity: 461,  fuel: "Gas",   owner: "Azura Power" },
  { id: "calabar",     name: "Calabar GenCo",    type: "Thermal", lat: 4.95,  lng: 8.33,  capacity: 611,  fuel: "Gas",   owner: "Calabar Power" },
  { id: "ibom",        name: "Ibom Power",       type: "Thermal", lat: 4.74,  lng: 7.52,  capacity: 190,  fuel: "Gas",   owner: "Akwa Ibom State" },
  { id: "trans_amadi", name: "Trans Amadi",      type: "Thermal", lat: 4.80,  lng: 7.02,  capacity: 100,  fuel: "Gas",   owner: "Rivers State" },
  { id: "paras",       name: "Paras Energy",     type: "Thermal", lat: 6.42,  lng: 3.29,  capacity: 100,  fuel: "Gas",   owner: "Paras Energy" },
];

export const TRANSMISSION = [
  { id: "t1",  name: "Shiroro–Ikeja 330kV",  coords: [[6.79, 10.10], [3.35, 6.60]],  voltage: "330kV" },
  { id: "t2",  name: "Kainji–Abuja 330kV",   coords: [[4.59, 9.86],  [7.49, 9.05]],  voltage: "330kV" },
  { id: "t3",  name: "Jebba–Ibadan 330kV",   coords: [[4.83, 9.13],  [3.90, 7.38]],  voltage: "330kV" },
  { id: "t4",  name: "Egbin–Ikeja 132kV",    coords: [[3.70, 6.58],  [3.35, 6.60]],  voltage: "132kV" },
  { id: "t5",  name: "Ughelli–PHC 330kV",    coords: [[6.00, 5.50],  [7.04, 4.82]],  voltage: "330kV" },
  { id: "t6",  name: "PHC–Afam 132kV",       coords: [[7.04, 4.82],  [7.22, 4.85]],  voltage: "132kV" },
  { id: "t7",  name: "Benin–Ibadan 330kV",   coords: [[5.62, 6.33],  [3.90, 7.38]],  voltage: "330kV" },
  { id: "t8",  name: "Kaduna–Kano 330kV",    coords: [[7.43, 10.52], [8.52, 12.00]], voltage: "330kV" },
  { id: "t9",  name: "Abuja–Kaduna 330kV",   coords: [[7.49, 9.05],  [7.43, 10.52]], voltage: "330kV" },
  { id: "t10", name: "Jos–Abuja 132kV",      coords: [[8.89, 9.92],  [7.49, 9.05]],  voltage: "132kV" },
  { id: "t11", name: "Azura–Benin 132kV",    coords: [[5.50, 6.58],  [5.62, 6.33]],  voltage: "132kV" },
  { id: "t12", name: "Geregu–Abuja 132kV",   coords: [[6.56, 7.74],  [7.49, 9.05]],  voltage: "132kV" },
];

// ── C&I Eligible Customers (NERC Market Participants List) ────
// 60 companies — coordinates placed at state centroids with small
// random offsets so overlapping companies are individually clickable.
export const CI_CUSTOMERS = [
  { id: 'ci002', name: 'INNER GALAXY STEEL COMPANY', lat: 5.53239, lng: 7.56759, state: 'Abia', address: 'Ahala Ukwu Obuzor Umuahala community in Ukwa west Abia State', sector: 'Steel / Metals', phone: '08081668888', email: 'igs@innergalaxygroup.com' },
  { id: 'ci003', name: 'KAM INDUSTRIES NIG LTD', lat: 8.91343, lng: 4.55868, state: 'Kwara', address: 'No5, new yidi road, industrial area. Ilorin, Kwara State', sector: 'Industrial', phone: '08033539817', email: 'kamwire@yahoo.com' },
  { id: 'ci004', name: 'KAM STEEL INTERGRATED COMPANY LTD', lat: 9.01177, lng: 4.63482, state: 'Kwara', address: 'No5, new yidi road, industrial area. Ilorin, Kwara State', sector: 'Steel / Metals', phone: '08033539817', email: 'kamintegratedsteal@hotmail.com' },
  { id: 'ci005', name: 'ASHAKACEM PLC', lat: 10.24098, lng: 11.10543, state: 'Gombe', address: 'Ashaka works, near Gombe', sector: 'Cement', phone: '', email: 'info@laparge.com.ng' },
  { id: 'ci006', name: 'CROWN FLOUR MILL LIMITED', lat: 8.92984, lng: 4.65868, state: 'Kwara', address: 'Tincan island port, sate no-2, tincan island. Apapa Nigeria', sector: 'Food & Beverage', phone: '08024654398', email: 'somnath.mardal@olamnet.com' },
  { id: 'ci007', name: 'TRANSCORP HOTELS PLC', lat: 9.13509, lng: 7.42232, state: 'Abuja', address: '1, Aguiyi Ironsi street, maitama', sector: 'Hospitality', phone: '094613000', email: 'info@transcorpnigeria.com' },
  { id: 'ci008', name: 'UNITED BANK FOR AFRICA PLC', lat: 6.532, lng: 3.33783, state: 'Lagos', address: '57, marina, Lagos', sector: 'Finance', phone: '23412807337', email: 'ernest.abhulimen@ubagroup.com' },
  { id: 'ci009', name: 'LORD\'S MINT TECHNOLOGIES NIGERIA LTD', lat: 7.08857, lng: 3.29285, state: 'Ogun', address: 'Beside Ofada Veetee Rice, Ewukoro, Ogun State', sector: 'Technology', phone: '08033066110', email: 'nasadlimited@yahoo.com' },
  { id: 'ci010', name: 'YONGXING STEEL COMPANY LTD', lat: 6.50295, lng: 5.92404, state: 'Edo', address: 'Ogua community by-pass road, Benin city, Edo', sector: 'Steel / Metals', phone: '08119020029', email: '1296813617@99.com' },
  { id: 'ci011', name: 'SUMO STEEL LIMITED', lat: 6.52715, lng: 3.4436, state: 'Lagos', address: '21/23 Abimbola street, Isolo industrial estate, Isolo Lagos', sector: 'Steel / Metals', phone: '08033808941', email: 'anjha2008@gmail.com' },
  { id: 'ci012', name: 'FEDERATED STEEL MILLS LIMITED', lat: 7.19263, lng: 3.29841, state: 'Ogun', address: 'Plot 3-10 blockII, Otta industrial Estate, Otta, Ogun State', sector: 'Steel / Metals', phone: '0806087262409087835315', email: 'anilnaidu67@gmail.com' },
  { id: 'ci013', name: 'JEBBA PAPER MILLS LIMITED', lat: 8.9817, lng: 4.62226, state: 'Kwara', address: 'Jebba town, moro LGA, Kwara state', sector: 'Manufacturing', phone: '07081511327', email: 'kumardinash-27@yahoo.com' },
  { id: 'ci014', name: 'PREMIUM STEEL & MINES LTD', lat: 5.63424, lng: 5.97464, state: 'Delta', address: 'Ovian-Aladja, PMB-1220, Warri, Delta State', sector: 'Steel / Metals', phone: '814133751808141+20', email: '' },
  { id: 'ci015', name: 'MICHAEL AND CECILIA FOUNDATION (MCF)', lat: 5.70306, lng: 5.92503, state: 'Delta', address: 'The pillars ibru village, Agbarha-otor, Ughelli-North LGA, Delta State', sector: 'Industrial', phone: '08033424255', email: '' },
  { id: 'ci016', name: 'OLAK ROOFING NIGERIA LIMITED', lat: 8.95389, lng: 4.62867, state: 'Kwara', address: 'Plot 5, New Yidi, Ilorin, Kwara State', sector: 'Manufacturing', phone: '08078990815', email: 'olakroofing@olakgroup.com.ng' },
  { id: 'ci017', name: 'SUNFLAG STEEL NIGERIA LTD', lat: 6.57099, lng: 3.32124, state: 'Lagos', address: 'Plot 37-39, Iganmu Industrial Estate Iganmu, Surulere, Lagos', sector: 'Steel / Metals', phone: '08029999119', email: 'sudarsan@sunflag.ng' },
  { id: 'ci018', name: 'STAR PIPE PRODUCT LTD', lat: 7.18287, lng: 3.32791, state: 'Ogun', address: 'Km21, Ikorodu-Sagamu RD Gbana Village, Shagamu, Ogun State', sector: 'Manufacturing', phone: '08057097642', email: 'operations.sppl@gmail.com' },
  { id: 'ci019', name: 'WEWOOD LIMITED', lat: 7.08005, lng: 4.77343, state: 'Ondo', address: 'No1 stepdown rd. Omotosho, Ondo State', sector: 'Industrial', phone: '08113000005', email: '934003319@99.com' },
  { id: 'ci020', name: 'ADEFOLORUNSHO TECHNICAL VENTURES LTD', lat: 7.18261, lng: 3.41267, state: 'Ogun', address: 'Km37, Abeokuta express way, opp Ali Isiba bus stop Sango Ota', sector: 'Technology', phone: '08055415649', email: 'funshopet@gmail.com' },
  { id: 'ci021', name: 'HYDROPOLIS INVESTMENT LTD', lat: 8.98459, lng: 7.54032, state: 'FCT', address: 'No4, Oyi River crescent off ibb boulevard maitama, Abuja', sector: 'Industrial', phone: '08033501606', email: '' },
  { id: 'ci022', name: 'KAM STEEL INTEGRATED CO LTD (OGUN)', lat: 9.02774, lng: 4.61463, state: 'Kwara', address: 'NO5 New Yidi Road Industrial Area Ilorin Kwara State', sector: 'Steel / Metals', phone: '08033539817', email: 'kamintegratedsteal@hotmail.com' },
  { id: 'ci023', name: 'FIRST MAXIMUMPOINT INDUSTRIES LTD', lat: 7.1783, lng: 4.91971, state: 'Ondo', address: 'Km4, Ita-Oniyan rd. off Ondo rd. Akure', sector: 'Industrial', phone: '08037192704', email: 'firstmaximum@yahoo.com' },
  { id: 'ci024', name: 'PULKIT ALLOY AND STEEL LIMITED', lat: 6.59953, lng: 3.41609, state: 'Lagos', address: 'Plot no.89x90, Ikorodu ind. Scheme, odungunyan, Ikorodu, Lagos', sector: 'Steel / Metals', phone: '08137235363', email: 'pilkit.nigeria@yahoo.in' },
  { id: 'ci025', name: 'ABUJA STEEL MILLS LIMITED', lat: 9.86024, lng: 5.65056, state: 'Niger', address: '18km from zuma rock, Abuja-kaduna express way, suleja,  Niger State', sector: 'Steel / Metals', phone: '08151965133', email: 'm.sahasrabudhe@africanindustries.com' },
  { id: 'ci026', name: 'DADTCO RIVERS CASSAVA PROCESSING CO. LTD', lat: 4.7712, lng: 6.91765, state: 'Rivers', address: 'Along Afam/ban-ogoi link road, beside ipp, Afam, Rivers', sector: 'Agriculture', phone: '08099905401', email: 'rjegiesen@gmail.com' },
  { id: 'ci027', name: 'OBAFEMI AWOLOWO UNIVERSITY, ILE-IFE', lat: 7.50388, lng: 4.50965, state: 'Osun', address: 'ILE-IFE', sector: 'Education', phone: '08066526542', email: 'registra@oauife.edu.ng' },
  { id: 'ci028', name: 'OLAM CROWN FLOUR MILLS LTD. CALABAR', lat: 5.96302, lng: 8.37088, state: 'Cross River', address: 'NPA Port Complex, Calabar', sector: 'Food & Beverage', phone: '09070269439', email: 'ashish.pande@olamnet.com' },
  { id: 'ci029', name: 'PRISM STEEL MILL LTD', lat: 7.54696, lng: 4.45124, state: 'Osun', address: 'KLM, 12, Osogbo-Ikirun rd, Ikirun', sector: 'Steel / Metals', phone: '8074349118', email: 'prismosun@gmail.com' },
  { id: 'ci030', name: 'JUDDY BOLEMA INDUSTRY LTD', lat: 6.24056, lng: 6.98988, state: 'Anambra', address: 'Km33 umoji road nkpor', sector: 'Industrial', phone: '08177722234', email: 'juddybolema@yahoo.com' },
  { id: 'ci031', name: 'OMNIK LIMITED', lat: 6.57853, lng: 3.3605, state: 'Lagos', address: 'Km18, Ikorodu rd, owode elede, Lagos', sector: 'Industrial', phone: '08188770033', email: 'omnik@omnik.biz' },
  { id: 'ci032', name: 'PHOENIX STEEL MILL LTD', lat: 7.20538, lng: 3.35763, state: 'Ogun', address: 'Km14, Ikorodu-sagamu rd, ogijo-remo, Ogun State', sector: 'Steel / Metals', phone: '08057097642', email: 'commercial@phoenixsteelmill.com' },
  { id: 'ci033', name: 'STAVIAN ENERGY LIMITED', lat: 5.38847, lng: 7.51009, state: 'Abia', address: 'Km3, akwete-umugbai rd, akwete', sector: 'Energy / Mining', phone: '08033103767', email: 'info@stavianenergy.com' },
  { id: 'ci034', name: 'TAOPEX STEEL LIMITED', lat: 7.20271, lng: 3.42768, state: 'OGUN', address: 'Igbata Village, Sagamu , Ogun State', sector: 'Steel / Metals', phone: '0834737745', email: 'info@taopexenergy.com' },
  { id: 'ci035', name: 'ATLANTIC METAL INDUSTRIES LTD', lat: 6.56342, lng: 3.33599, state: 'Lagos', address: '20 Oba akin jobi str gra ikeja lagos', sector: 'Steel / Metals', phone: '09133067027', email: 'atlanticmetal2021@gmail.com' },
  { id: 'ci036', name: 'IFE IRON AND STEEL NIG LTD', lat: 7.56513, lng: 4.52642, state: 'Osun', address: 'Plot39 ogun wusi village, fashina, ife-ibadan exp way, ile ife,osun', sector: 'Steel / Metals', phone: '09056877617', email: 'atanu.datta@spplpaper.com' },
  { id: 'ci037', name: 'FEDERAL AIRPORTS AUTHORITY OF NIGERIA (IKEJA)', lat: 9.03029, lng: 7.52372, state: 'Abuja', address: '6 Bissau Street, Wuse Zone 6', sector: 'Aviation', phone: '08065334251', email: 'yakubu.sule@faan.gov.ng' },
  { id: 'ci038', name: 'ZEBERCED LIMITED', lat: 9.0201, lng: 7.55552, state: 'Abuja', address: 'Plot 1001 off gbazango new ext. Kubwa Abuja', sector: 'Industrial', phone: '08151414149', email: 'info@zeberced.com' },
  { id: 'ci039', name: 'CROWN FLOUR MILL LIMITED (KADUNA)', lat: 10.47085, lng: 7.45102, state: 'Kaduna', address: 'Km25, along kaduna-abuja exp. Way', sector: 'Food & Beverage', phone: '08024654398', email: 'somnath.mandal@olamagri.com' },
  { id: 'ci040', name: 'PZ CUSSONS NIGERIA PLC', lat: 6.59551, lng: 3.42435, state: 'Lagos', address: 'NO 45/47, Town Planning Way, Ilupeju, Lagos', sector: 'Industrial', phone: '23412773415', email: 'pzccommunications@pzcussons.com' },
  { id: 'ci041', name: 'FRIESLAND CAMPINA WAMCO NIGERIA PLS', lat: 6.58974, lng: 3.40895, state: 'Lagos', address: 'Plot 7B,Acme Road Ogba Industrial Estate, Lagos State', sector: 'Food & Beverage', phone: '08023180097', email: 'adekola.lamidi@frieslandcampina.com' },
  { id: 'ci042', name: 'NAK STEEL ROLLING AND PROCESSING MILL LTD', lat: 13.06427, lng: 7.55122, state: 'Katsina', address: 'Danoume Road, Funtua, Katsina State', sector: 'Steel / Metals', phone: '08035555880', email: 'naksteelrollingandprocessing@gmail.com' },
  { id: 'ci043', name: 'QUANTUM STEELS NIGERIA LIMITED', lat: 7.14444, lng: 3.27148, state: 'Ogun', address: 'Km16 off Shagamu Ikorodu Road Ewujagun Village, Erefun Gbaga ogijo Ogun State', sector: 'Steel / Metals', phone: '08150998785', email: 'ngupta@qpnlnig.com' },
  { id: 'ci044', name: 'MONARCH STEEL MILLS LIMITED', lat: 7.1381, lng: 3.33019, state: 'Ogun', address: '12B Shonibare Estate, Maryland, Ikeja, Lagos State', sector: 'Steel / Metals', phone: '08072294000', email: 'msml.nigeria@gmail.com' },
  { id: 'ci045', name: 'NIGERIAN BREWERIES PLC (Kaduna)', lat: 6.46129, lng: 3.37814, state: 'Lagos', address: 'Iganmu House, Abebe Village Road, Iganmu, Lagos State', sector: 'Industrial', phone: '08006000000', email: 'info@nbplc.com' },
  { id: 'ci046', name: 'PAULAZANDA NIGERIA LIMITED', lat: 4.77206, lng: 6.86969, state: 'Rivers', address: '234 Aba PH Express Way, Rumuoga Portharcourt', sector: 'Industrial', phone: '08037867831', email: 'eaaamadi@yahoo.co.uk' },
  { id: 'ci047', name: 'SHONGAI TECHNOLOGIES LIMITED', lat: 7.10619, lng: 3.42129, state: 'Ogun', address: 'KM40 Lagos Abeokuta Express Way Sango Ota', sector: 'Technology', phone: '09073019483', email: 'info@shongaitechnologiesltd.com' },
  { id: 'ci048', name: 'GEEPEE INDUSTRIES NIGERIA LIMITED', lat: 7.09189, lng: 3.28181, state: 'Ogun', address: 'KM38 Abeokuta Motor Road, Sango Ota, Ogun State', sector: 'Industrial', phone: '08099990250', email: 'info@geepeeindustries.com' },
  { id: 'ci049', name: 'KIARA RICE MILLS LIMITED', lat: 10.00642, lng: 5.6759, state: 'Niger', address: 'Kpatsuwa Village km10 Jebba Mokwa Road, Niger State', sector: 'Food & Beverage', phone: '08160987445', email: 'purchase.ng@pjsglobal.com' },
  { id: 'ci050', name: 'COVENANT UNIVERSITY CONSULT. SERV. & INV. CO LTD', lat: 7.21634, lng: 3.33006, state: 'Ogun', address: 'KM10 Idiroko Road, Ota Ogun State', sector: 'Education', phone: '07061148974', email: 'cu.consults@convenantuniversity.edu.ng' },
  { id: 'ci051', name: 'ORBIT HOT STRIP MILLS LIMITED', lat: 7.17609, lng: 3.35747, state: 'Ogun', address: 'KM45, Shagamu Ikorodu Express Way, Ogun State Ogijo', sector: 'Steel / Metals', phone: '08072892009', email: '' },
  { id: 'ci052', name: 'AVATAR NEW ENERGY MATERIALS CO. LTD', lat: 8.52747, lng: 8.17895, state: 'Nasarawa', address: 'Kama Otto Road, Nasarawa LGA, Nasarawa State', sector: 'Energy / Mining', phone: '09091251798', email: 'liu_yingnan@163.com' },
  { id: 'ci053', name: 'TOWER ALLOYS INDUSTRIES LTD', lat: 6.45644, lng: 3.3323, state: 'Lagos', address: 'Plot 9 Oba Akran Avenue, Ikeja', sector: 'Steel / Metals', phone: '09068681342', email: 'info.toweralloys@toweraig.com' },
  { id: 'ci054', name: 'NASASUPER PLASTIC INDUSTRY LTD', lat: 8.5742, lng: 8.27282, state: 'Nasarawa', address: 'KM16, Keffi Abuja, Gora, Karu', sector: 'Manufacturing', phone: '08033225743', email: 'abaadesanya@gmail.com' },
  { id: 'ci055', name: 'TOWER ROLLING AND GALVANIZING MILLS LIMITED', lat: 6.47758, lng: 3.43679, state: 'Lagos', address: '11 Danfodio Street Off Liverpool Road, Apapa Lagos', sector: 'Steel / Metals', phone: '09068681342', email: 'info@toweraig.com' },
  { id: 'ci056', name: 'WEST AFRICAN STEEL PROCESSING AND EXPORTS COMPANY LIMITED', lat: 6.53206, lng: 3.32596, state: 'Lagos', address: '1 Danfodio Street Off Liverpool Road, Apapa Lagos', sector: 'Steel / Metals', phone: '09155490485', email: 'info@africanindustries.com' },
  { id: 'ci057', name: 'AFRICAN FOUNDRIES LIMITED (AFL)', lat: 7.17455, lng: 3.36037, state: 'Ogun', address: 'KM45 Shagamu Ikorodu Express Way Ogijo, Ogun State', sector: 'Industrial', phone: '07015831220', email: 'info@africanindustries.com' },
  { id: 'ci058', name: 'QUALITEC INDUSTRIES LIMITED', lat: 6.49998, lng: 3.32194, state: 'Lagos', address: '679 Lagos Abeokuta Road, Ojokoro Lagos', sector: 'Industrial', phone: '09035056665', email: 'adeyeye_da@yahoo.com' },
  { id: 'ci059', name: 'PROFORTE MINING AND RESOURCES LIMITED', lat: 6.56516, lng: 3.42497, state: 'Lagos', address: 'NO14A Ajisafe Street, Off Isaac John Ikeja Lagos State', sector: 'Energy / Mining', phone: '09071919135', email: 'adetunji.adeyeye@taopexenergy.com' },
  { id: 'ci060', name: 'ER-KANG MINING NIGERIA COMPANY LIMITED', lat: 8.9919, lng: 4.64307, state: 'Kwara', address: 'NO2 Haruna Street, Agric Estate, Ilorin, Kwara State', sector: 'Energy / Mining', phone: '07032477660', email: 'nyemmy@gmail.com' },
  { id: 'ci061', name: 'LEB OIL NIGERIA LTD', lat: 5.7024, lng: 5.90046, state: 'Delta', address: 'NO10 Eboigbe Road, Owa Alero Agbor Delta State', sector: 'Energy / Mining', phone: '07032156555', email: 'leboil@leboilltd.com' },
];

export const GEOPOLITICAL_ZONES = {
  "North West":    { color: "#1a3a5c", states: ["Kano", "Kaduna", "Katsina", "Kebbi", "Sokoto", "Zamfara", "Jigawa"] },
  "North East":    { color: "#1a4a3a", states: ["Borno", "Yobe", "Adamawa", "Gombe", "Bauchi", "Taraba"] },
  "North Central": { color: "#3a2a5c", states: ["Plateau", "Benue", "Kogi", "Kwara", "Nasarawa", "Niger", "FCT"] },
  "South West":    { color: "#5c3a1a", states: ["Lagos", "Ogun", "Oyo", "Osun", "Ondo", "Ekiti"] },
  "South East":    { color: "#5c1a1a", states: ["Enugu", "Anambra", "Imo", "Abia", "Ebonyi"] },
  "South South":   { color: "#3a4a1a", states: ["Rivers", "Delta", "Edo", "Bayelsa", "Akwa Ibom", "Cross River"] },
};

/** Returns the geopolitical zone and colour for a given state name. */
export function getZoneForState(name) {
  for (const [zone, data] of Object.entries(GEOPOLITICAL_ZONES)) {
    if (data.states.some(s => name.toLowerCase().includes(s.toLowerCase())))
      return { zone, color: data.color };
  }
  return { zone: "Unknown", color: "#1a2535" };
}
