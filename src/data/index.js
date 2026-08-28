// ─────────────────────────────────────────────────────────────────────────────
//  Nigeria C&I GIS — Market Participants Data
//  Sources: NERC Excel contact list (all 6 sheets) + enriched hardcoded data
//  DISCOs: 12 | GenCos/NIPP/IPP: 32 | Traders: 5 | C&I Customers: 60
// ─────────────────────────────────────────────────────────────────────────────

// ── DISCOs (12) ── Hardcoded data enriched with NERC contact details ─────────
export const DISCOS = [
  { id:"AEDC",   name:"Abuja Electricity Distribution Co. PLC",        lat:9.05,  lng:7.49,  states:"FCT, Kogi, Niger, Nasarawa",               customers:"600K+", capacity:"1,095 MW", color:"#f5a623", phone:"07010026908", email:"crouchern@cec.com.tm",       address:"1, Ziguinchor Street, Wuse Zone 4, Abuja" },
  { id:"APL",    name:"APL Electricity Company",                        lat:5.39,  lng:7.60,  states:"Abia",                                      customers:"N/A",    capacity:"N/A",       color:"#a855f7", phone:"08136654066", email:"info@geometricpower.com",    address:"2 Geometric Power Rd, Osisioma, Aba" },
  { id:"BEDC",   name:"Benin Electricity Distribution Co. PLC",         lat:6.33,  lng:5.62,  states:"Edo, Delta, Ondo, Ekiti",                   customers:"530K+", capacity:"900 MW",    color:"#e05252", phone:"08023440347", email:"funkeosibodu@citiinvestmentcap.com", address:"5, Akpakpaya Road, Benin City" },
  { id:"EKEDC",  name:"Eko Electricity Distribution Co.",               lat:6.45,  lng:3.38,  states:"Lagos South",                               customers:"800K+", capacity:"1,400 MW",  color:"#00e5a0", phone:"08033048489", email:"ceo@ekoelectricityng.com",   address:"24/25, Marina, Lagos" },
  { id:"EEDC",   name:"Enugu Electricity Distribution Co. PLC",         lat:6.45,  lng:7.51,  states:"Enugu, Anambra, Imo, Abia, Ebonyi",        customers:"780K+", capacity:"1,150 MW",  color:"#3b82f6", phone:"042293905",   email:"rokoye@enugudisco.com",      address:"62, Okpara Avenue, Enugu" },
  { id:"IBEDC",  name:"Ibadan Electricity Distribution Co. PLC",        lat:7.38,  lng:3.90,  states:"Oyo, Ogun, Osun, Kwara",                   customers:"1.2M+", capacity:"1,600 MW",  color:"#f59e0b", phone:"08146259506", email:"fcleynes@meralco.com.ph",    address:"Capital Bldg, 115 Ring Road, Ibadan" },
  { id:"IKEDC",  name:"Ikeja Electricity Distribution Co. PLC",         lat:6.60,  lng:3.35,  states:"Lagos North",                               customers:"800K+", capacity:"1,200 MW",  color:"#10b981", phone:"07052147345", email:"compsec@ikedc.com",           address:"Ikeja DisCo Secrd, Alausa, Ikeja, Lagos" },
  { id:"JEDC",   name:"Jos Electricity Distribution Co. PLC",           lat:9.92,  lng:8.89,  states:"Plateau, Benue, Taraba, Gombe",             customers:"280K+", capacity:"550 MW",    color:"#6366f1", phone:"08111793291", email:"info@jedplc.com.ng",          address:"9, Ahmadu Bello Way, Jos, Plateau State" },
  { id:"KAEDCO", name:"Kaduna Electricity Distribution Co.",             lat:10.52, lng:7.43,  states:"Kaduna, Kebbi, Sokoto, Zamfara",            customers:"450K+", capacity:"800 MW",    color:"#ec4899", phone:"08033117676", email:"jiddere123@gmail.com",        address:"1/2 Ahmadu Bello Way, Kaduna" },
  { id:"KEDCO",  name:"Kano Electricity Distribution Co. PLC",           lat:12.00, lng:8.52,  states:"Kano, Katsina, Jigawa",                    customers:"640K+", capacity:"850 MW",    color:"#14b8a6", phone:"08093460066", email:"info@kedco-ng.com",           address:"1, Niger Street/Post Office Rd, Kano" },
  { id:"PHEDC",  name:"Port Harcourt Electricity Distribution Co. PLC", lat:4.82,  lng:7.04,  states:"Rivers, Bayelsa, Akwa Ibom, Cross River",   customers:"500K+", capacity:"960 MW",    color:"#8b5cf6", phone:"08114646303", email:"info@phed.com.ng",             address:"1, Moscow Rd, Port Harcourt, Rivers State" },
  { id:"YEDC",   name:"Yola Electricity Distribution Co. PLC",           lat:9.20,  lng:12.48, states:"Adamawa, Borno, Yobe",                     customers:"185K+", capacity:"400 MW",    color:"#f97316", phone:"08146259508", email:"info@yedc.com.ng",             address:"Jimeta-Yola, Adamawa State" },
];

// ── GenCos / NIPP / IPP (32) ── All coordinates verified via Google Places ──
export const GENCOS = [
  // ── Legacy GenCos ────────────────────────────────────────────────────────
  { id:"egbin",       name:"Egbin Power Plant",          type:"Thermal", subtype:"GenCo", lat:6.5628,  lng:3.6145,  capacity:1320, fuel:"Gas",   owner:"Sahara Power",      phone:"08038237747", email:"kingsleyokutie@egbinpower.com" },
  { id:"kainji",      name:"Kainji Hydro Power",         type:"Hydro",   subtype:"GenCo", lat:9.8637,  lng:4.6121,  capacity:760,  fuel:"Water", owner:"Mainstream Energy", phone:"08086464331", email:"info@mainstream.com" },
  { id:"jebba",       name:"Mainstream (Jebba Station)", type:"Hydro",   subtype:"GenCo", lat:9.1367,  lng:4.7878,  capacity:578,  fuel:"Water", owner:"Mainstream Energy", phone:"08086464331", email:"info@mainstream.com" },
  { id:"shiroro",     name:"Shiroro Hydro Power",        type:"Hydro",   subtype:"GenCo", lat:9.9731,  lng:6.8343,  capacity:600,  fuel:"Water", owner:"TCN/NBET",           phone:"08038085094", email:"shirorotechreview@yahoo.com" },
  { id:"ughelli",     name:"Ughelli Power PLC",          type:"Thermal", subtype:"GenCo", lat:5.5422,  lng:5.9174,  capacity:972,  fuel:"Gas",   owner:"Transcorp",          phone:"08039754537", email:"info@trancorpuelli.com" },
  { id:"sapele",      name:"Eurafric Sapele Power PLC",   type:"Thermal", subtype:"GenCo", lat:5.9239,  lng:5.6459,  capacity:1020, fuel:"Gas",   owner:"Eurafic/Transcorp",  phone:"08033931598", email:"ifionuspple@yahoo.com" },
  { id:"afam",        name:"Afam Power PLC",             type:"Thermal", subtype:"GenCo", lat:4.8511,  lng:7.2533,  capacity:624,  fuel:"Gas",   owner:"SPDC/NBET",          phone:"",            email:"info@afampowerplc.com" },
  { id:"geregu",      name:"Geregu Power PLC",           type:"Thermal", subtype:"GenCo", lat:7.4706,  lng:6.6595,  capacity:414,  fuel:"Gas",   owner:"AMNI Petroleum",     phone:"08075370694", email:"phcngps@gmail.com" },
  { id:"olorunsogo",  name:"Olorunsogo Power PLC",       type:"Thermal", subtype:"GenCo", lat:6.8848,  lng:3.3162,  capacity:726,  fuel:"Gas",   owner:"Mainstream Energy",  phone:"08034022432", email:"okezic@gmail.com" },
  { id:"omotosho",    name:"Omotosho Power PLC",         type:"Thermal", subtype:"GenCo", lat:6.7325,  lng:4.7115,  capacity:500,  fuel:"Gas",   owner:"Amni Intl",          phone:"08034022432", email:"okezic@gmail.com" },
  { id:"azura",       name:"Azura-Edo IPP",              type:"Thermal", subtype:"IPP",   lat:6.4110,  lng:5.6804,  capacity:461,  fuel:"Gas",   owner:"Azura Power",        phone:"08128738420", email:"commercial@azuraedo.com" },
  { id:"calabar",     name:"Calabar GenCo",              type:"Thermal", subtype:"GenCo", lat:5.0702,  lng:8.3386,  capacity:611,  fuel:"Gas",   owner:"Calabar Power",      phone:"",            email:"" },
  { id:"ibom",        name:"Ibom Power",                 type:"Thermal", subtype:"IPP",   lat:4.5644,  lng:7.5674,  capacity:190,  fuel:"Gas",   owner:"Akwa Ibom State",    phone:"08052340000", email:"info@ibompower.com" },
  { id:"trans_amadi", name:"Trans Amadi Power",          type:"Thermal", subtype:"GenCo", lat:4.8174,  lng:7.0294,  capacity:100,  fuel:"Gas",   owner:"Rivers State",       phone:"",            email:"" },
  { id:"paras",       name:"Paras Energy & Natural Resources", type:"Thermal", subtype:"IPP", lat:6.7200, lng:3.5212, capacity:100, fuel:"Gas",  owner:"Paras Energy",       phone:"08073794583", email:"info@parasenergy.com" },

  // ── NIPP Companies (NDPHC subsidiaries) ──────────────────────────────────
  { id:"nipp_alaoji",      name:"Alaoji Generation Co. (NIPP)",      type:"Thermal", subtype:"NIPP", lat:5.0670,  lng:7.3213,  capacity:504,  fuel:"Gas",   owner:"NDPHC", phone:"08036437318", email:"legal@ndphc.net" },
  { id:"nipp_calabar",     name:"Calabar Generation Co. (NIPP)",     type:"Thermal", subtype:"NIPP", lat:5.0702,  lng:8.3386,  capacity:561,  fuel:"Gas",   owner:"NDPHC", phone:"08036437318", email:"legal@ndphc.net" },
  { id:"nipp_gbarain",     name:"Gbarain Generation Co. (NIPP)",     type:"Thermal", subtype:"NIPP", lat:5.0310,  lng:6.3015,  capacity:225,  fuel:"Gas",   owner:"NDPHC", phone:"08033378362", email:"legal@ndphc.net" },
  { id:"nipp_geregu",      name:"Geregu Generation Co. (NIPP)",      type:"Thermal", subtype:"NIPP", lat:7.4706,  lng:6.6595,  capacity:434,  fuel:"Gas",   owner:"NDPHC", phone:"08036437318", email:"legal@ndphc.net" },
  { id:"nipp_ihovbor",     name:"Ihovbor Generation Co. (NIPP)",     type:"Thermal", subtype:"NIPP", lat:6.4068,  lng:5.6826,  capacity:461,  fuel:"Gas",   owner:"NDPHC", phone:"08033378362", email:"legal@ndphc.net" },
  { id:"nipp_ogorode",     name:"Ogorode Generation Co. (NIPP)",     type:"Thermal", subtype:"NIPP", lat:5.9251,  lng:5.6453,  capacity:450,  fuel:"Gas",   owner:"NDPHC", phone:"08036437318", email:"ebobor@lawfieldsolicitors.com" },
  { id:"nipp_olorunsogo",  name:"Olorunsogo Generation Co. (NIPP)",  type:"Thermal", subtype:"NIPP", lat:6.8848,  lng:3.3162,  capacity:676,  fuel:"Gas",   owner:"NDPHC", phone:"08033378362", email:"ebobor@lawfieldsolicitors.com" },
  { id:"nipp_omotosho",    name:"Omotosho Generation Co. (NIPP)",    type:"Thermal", subtype:"NIPP", lat:6.7325,  lng:4.7115,  capacity:500,  fuel:"Gas",   owner:"NDPHC", phone:"08033378362", email:"legal@ndphc.net" },

  // ── IPP Companies ────────────────────────────────────────────────────────
  { id:"ipp_aes",       name:"AES Nigeria (Barge)",                    type:"Thermal", subtype:"IPP", lat:6.5595,  lng:3.6146,  capacity:270,  fuel:"Gas",   owner:"AES Corp",          phone:"",            email:"" },
  { id:"ipp_fipc",      name:"First Independent Power Co.",           type:"Thermal", subtype:"IPP", lat:4.8032,  lng:7.3259,  capacity:160,  fuel:"Gas",   owner:"First Hydrocarbon", phone:"08033114820", email:"info@fipl-ng.com" },
  { id:"ipp_ajaokuta",  name:"Ajaokuta Steel Co. Ltd (ASCON)",        type:"Thermal", subtype:"IPP", lat:7.5221,  lng:6.6956,  capacity:110,  fuel:"Gas",   owner:"ASCON",             phone:"08037034501", email:"joeisah@gmail.com" },
  { id:"ipp_agip",      name:"AGIP NAOC (Okpai IPP)",                 type:"Thermal", subtype:"IPP", lat:5.7112,  lng:6.5750,  capacity:480,  fuel:"Gas",   owner:"ENI/AGIP",          phone:"07034190612", email:"ebikabowei.fakiogles@naoc.agip.it" },
  { id:"ipp_geometric", name:"Geometric Power Ltd",                   type:"Thermal", subtype:"IPP", lat:5.4527,  lng:7.5248,  capacity:188,  fuel:"Gas",   owner:"Geometric Power",   phone:"08023464664", email:"caven@geometricpower.com" },
  { id:"ipp_ogbele",    name:"Ogbele Cummins",                        type:"Thermal", subtype:"IPP", lat:5.0500,  lng:6.6800,  capacity:56,   fuel:"Gas",   owner:"Cummins",           phone:"08023176262", email:"info@cummis-power-nigeria.com" },
  { id:"ipp_lambarimi", name:"Lamba Rimi Electricity Generation Co.", type:"Thermal", subtype:"IPP", lat:13.0100, lng:7.5900,  capacity:50,   fuel:"Gas",   owner:"Lamba Rimi",        phone:"08144945956", email:"philefe71@yahoo.com" },
  { id:"ipp_taopex",    name:"Taopex Energy Services Co.",            type:"Thermal", subtype:"IPP", lat:6.5850,  lng:3.3559,  capacity:80,   fuel:"Gas",   owner:"Taopex Energy",     phone:"08033539817", email:"info@taopexenergy.com" },
  { id:"ipp_mabon",     name:"Mabon Energy Ltd (Dadin Kowa)",         type:"Hydro",   subtype:"IPP", lat:10.3212, lng:11.4815, capacity:40,   fuel:"Water", owner:"Mabon Energy",      phone:"08053274610", email:"mabonenergy@mabonltd.com" },
];

// ── Traders (5) ── From NERC contact list ─────────────────────────────────────
export const TRADERS = [
  { id:"nbet",      name:"Nigeria Bulk Electricity Trading PLC",  lat:9.04870, lng:7.48411, address:"2nd & 3rd Floors, NERC Building, Plot 1387, Cadastral Zone, Central Business District, Abuja", email:"", phone:"+234 704 666 2555" },
  { id:"konexa",    name:"ECOF Kaduna Ltd (Konexa)",              lat:6.46130, lng:3.45867, address:"Plot L2, 401 Close, Banana Island, Ikoyi, Lagos",          email:"",  phone:"" },
  { id:"eunl",      name:"Electric Utilities Nigeria Ltd",        lat:6.43408, lng:3.42780, address:"5th Floor, AIICO Plaza, Plot PC 12, Churchgate Street, Victoria Island, Lagos", email:"", phone:"" },
  { id:"aenel",     name:"Adefolorunsho Energy Network Ltd",      lat:6.70757, lng:3.24210, address:"Km 37, Lagos-Abeokuta Expressway, Opp Ali-Isiba B/Stop, Sango Ota, Ogun", email:"", phone:"" },
  { id:"onction",   name:"Onction Services Limited",              lat:6.45283, lng:3.42285, address:"5C, Adekunle Lawal Road, Off Second Avenue, Ikoyi, Lagos",  email:"",  phone:"" },
];

// ── Transmission Lines ────────────────────────────────────────────────────────
export const TRANSMISSION = [
  { id:"t1",  name:"Shiroro-Ikeja 330kV",  coords:[[6.79,10.10],[3.35,6.60]],  voltage:"330kV" },
  { id:"t2",  name:"Kainji-Abuja 330kV",   coords:[[4.59,9.86], [7.49,9.05]],  voltage:"330kV" },
  { id:"t3",  name:"Jebba-Ibadan 330kV",   coords:[[4.83,9.13], [3.90,7.38]],  voltage:"330kV" },
  { id:"t4",  name:"Egbin-Ikeja 132kV",    coords:[[3.70,6.58], [3.35,6.60]],  voltage:"132kV" },
  { id:"t5",  name:"Ughelli-PHC 330kV",    coords:[[6.00,5.50], [7.04,4.82]],  voltage:"330kV" },
  { id:"t6",  name:"PHC-Afam 132kV",       coords:[[7.04,4.82], [7.22,4.85]],  voltage:"132kV" },
  { id:"t7",  name:"Benin-Ibadan 330kV",   coords:[[5.62,6.33], [3.90,7.38]],  voltage:"330kV" },
  { id:"t8",  name:"Kaduna-Kano 330kV",    coords:[[7.43,10.52],[8.52,12.00]], voltage:"330kV" },
  { id:"t9",  name:"Abuja-Kaduna 330kV",   coords:[[7.49,9.05], [7.43,10.52]], voltage:"330kV" },
  { id:"t10", name:"Jos-Abuja 132kV",      coords:[[8.89,9.92], [7.49,9.05]],  voltage:"132kV" },
  { id:"t11", name:"Azura-Benin 132kV",    coords:[[5.50,6.58], [5.62,6.33]],  voltage:"132kV" },
  { id:"t12", name:"Geregu-Abuja 132kV",   coords:[[6.56,7.74], [7.49,9.05]],  voltage:"132kV" },
];

// ── C&I Eligible Customers (60) ── NERC Market Participants ─────────────────
export const CI_CUSTOMERS = [
  { id:"ci002", name:"INNER GALAXY STEEL COMPANY", lat:5.53239, lng:7.56759, state:"Abia", address:"Ahala Ukwu Obuzor Umuahala community in Ukwa west Abia State", sector:"Steel / Metals", phone:"08081668888", email:"igs@innergalaxygroup.com" },
  { id:"ci003", name:"KAM INDUSTRIES NIG LTD", lat:8.91343, lng:4.55868, state:"Kwara", address:"No5, new yidi road, industrial area. Ilorin, Kwara State", sector:"Industrial", phone:"08033539817", email:"kamwire@yahoo.com" },
  { id:"ci004", name:"KAM STEEL INTERGRATED COMPANY LTD", lat:9.01177, lng:4.63482, state:"Kwara", address:"No5, new yidi road, industrial area. Ilorin, Kwara State", sector:"Steel / Metals", phone:"08033539817", email:"kamintegratedsteal@hotmail.com" },
  { id:"ci005", name:"ASHAKACEM PLC", lat:10.24098, lng:11.10543, state:"Gombe", address:"Ashaka works, near Gombe", sector:"Cement", phone:"", email:"info@laparge.com.ng" },
  { id:"ci006", name:"CROWN FLOUR MILL LIMITED", lat:8.92984, lng:4.65868, state:"Kwara", address:"Tincan island port, sate no-2, tincan island. Apapa Nigeria", sector:"Food & Beverage", phone:"08024654398", email:"somnath.mardal@olamnet.com" },
  { id:"ci007", name:"TRANSCORP HOTELS PLC", lat:9.13509, lng:7.42232, state:"Abuja", address:"1, Aguiyi Ironsi street, maitama", sector:"Hospitality", phone:"094613000", email:"info@transcorpnigeria.com" },
  { id:"ci008", name:"UNITED BANK FOR AFRICA PLC", lat:6.532, lng:3.33783, state:"Lagos", address:"57, marina, Lagos", sector:"Finance", phone:"08023268658", email:"ernest.abhulimen@ubagroup.com" },
  { id:"ci009", name:"LORD S MINT TECHNOLOGIES NIGERIA LTD", lat:7.08857, lng:3.29285, state:"Ogun", address:"Beside Ofada Veetee Rice, Ewukoro, Ogun State", sector:"Technology", phone:"08033066110", email:"nasadlimited@yahoo.com" },
  { id:"ci010", name:"YONGXING STEEL COMPANY LTD", lat:6.50295, lng:5.92404, state:"Edo", address:"Ogua community by-pass road, Benin city, Edo", sector:"Steel / Metals", phone:"08119020029", email:"" },
  { id:"ci011", name:"SUMO STEEL LIMITED", lat:6.52715, lng:3.4436, state:"Lagos", address:"21/23 Abimbola street, Isolo industrial estate, Isolo Lagos", sector:"Steel / Metals", phone:"08033808941", email:"anjha2008@gmail.com" },
  { id:"ci012", name:"FEDERATED STEEL MILLS LIMITED", lat:7.19263, lng:3.29841, state:"Ogun", address:"Plot 3-10 blockII, Otta industrial Estate, Otta, Ogun State", sector:"Steel / Metals", phone:"08060872624", email:"anilnaidu67@gmail.com" },
  { id:"ci013", name:"JEBBA PAPER MILLS LIMITED", lat:8.9817, lng:4.62226, state:"Kwara", address:"Jebba town, moro LGA, Kwara state", sector:"Manufacturing", phone:"07081511327", email:"kumardinash-27@yahoo.com" },
  { id:"ci014", name:"PREMIUM STEEL AND MINES LTD", lat:5.63424, lng:5.97464, state:"Delta", address:"Ovian-Aladja, PMB-1220, Warri, Delta State", sector:"Steel / Metals", phone:"", email:"" },
  { id:"ci015", name:"MICHAEL AND CECILIA FOUNDATION (MCF)", lat:5.70306, lng:5.92503, state:"Delta", address:"The pillars ibru village, Agbarha-otor, Ughelli-North LGA, Delta State", sector:"Industrial", phone:"08033424255", email:"" },
  { id:"ci016", name:"OLAK ROOFING NIGERIA LIMITED", lat:8.95389, lng:4.62867, state:"Kwara", address:"Plot 5, New Yidi, Ilorin, Kwara State", sector:"Manufacturing", phone:"08078990815", email:"olakroofing@olakgroup.com.ng" },
  { id:"ci017", name:"SUNFLAG STEEL NIGERIA LTD", lat:6.57099, lng:3.32124, state:"Lagos", address:"Plot 37-39, Iganmu Industrial Estate Iganmu, Surulere, Lagos", sector:"Steel / Metals", phone:"08029999119", email:"sudarsan@sunflag.ng" },
  { id:"ci018", name:"STAR PIPE PRODUCT LTD", lat:7.18287, lng:3.32791, state:"Ogun", address:"Km21, Ikorodu-Sagamu RD Gbana Village, Shagamu, Ogun State", sector:"Manufacturing", phone:"08057097642", email:"operations.sppl@gmail.com" },
  { id:"ci019", name:"WEWOOD LIMITED", lat:7.08005, lng:4.77343, state:"Ondo", address:"No1 stepdown rd. Omotosho, Ondo State", sector:"Industrial", phone:"08113000005", email:"" },
  { id:"ci020", name:"ADEFOLORUNSHO TECHNICAL VENTURES LTD", lat:7.18261, lng:3.41267, state:"Ogun", address:"Km37, Abeokuta express way, opp Ali Isiba bus stop Sango Ota", sector:"Technology", phone:"08055415649", email:"funshopet@gmail.com" },
  { id:"ci021", name:"HYDROPOLIS INVESTMENT LTD", lat:8.98459, lng:7.54032, state:"FCT", address:"No4, Oyi River crescent off ibb boulevard maitama, Abuja", sector:"Industrial", phone:"08033501606", email:"" },
  { id:"ci022", name:"KAM STEEL INTEGRATED CO LTD (OGUN)", lat:9.02774, lng:4.61463, state:"Kwara", address:"NO5 New Yidi Road Industrial Area Ilorin Kwara State", sector:"Steel / Metals", phone:"08033539817", email:"kamintegratedsteal@hotmail.com" },
  { id:"ci023", name:"FIRST MAXIMUMPOINT INDUSTRIES LTD", lat:7.1783, lng:4.91971, state:"Ondo", address:"Km4, Ita-Oniyan rd. off Ondo rd. Akure", sector:"Industrial", phone:"08037192704", email:"firstmaximum@yahoo.com" },
  { id:"ci024", name:"PULKIT ALLOY AND STEEL LIMITED", lat:6.59953, lng:3.41609, state:"Lagos", address:"Plot no.89x90, Ikorodu ind. Scheme, odungunyan, Ikorodu, Lagos", sector:"Steel / Metals", phone:"08137235363", email:"pilkit.nigeria@yahoo.in" },
  { id:"ci025", name:"ABUJA STEEL MILLS LIMITED", lat:9.86024, lng:5.65056, state:"Niger", address:"18km from zuma rock, Abuja-kaduna express way, suleja, Niger State", sector:"Steel / Metals", phone:"08151965133", email:"m.sahasrabudhe@africanindustries.com" },
  { id:"ci026", name:"DADTCO RIVERS CASSAVA PROCESSING CO. LTD", lat:4.7712, lng:6.91765, state:"Rivers", address:"Along Afam road, beside ipp, Afam, Rivers", sector:"Agriculture", phone:"08099905401", email:"rjegiesen@gmail.com" },
  { id:"ci027", name:"OBAFEMI AWOLOWO UNIVERSITY ILE-IFE", lat:7.50388, lng:4.50965, state:"Osun", address:"ILE-IFE", sector:"Education", phone:"08066526542", email:"registra@oauife.edu.ng" },
  { id:"ci028", name:"OLAM CROWN FLOUR MILLS LTD CALABAR", lat:5.96302, lng:8.37088, state:"Cross River", address:"NPA Port Complex, Calabar", sector:"Food & Beverage", phone:"09070269439", email:"ashish.pande@olamnet.com" },
  { id:"ci029", name:"PRISM STEEL MILL LTD", lat:7.54696, lng:4.45124, state:"Osun", address:"KLM 12, Osogbo-Ikirun rd, Ikirun", sector:"Steel / Metals", phone:"08074349118", email:"prismosun@gmail.com" },
  { id:"ci030", name:"JUDDY BOLEMA INDUSTRY LTD", lat:6.24056, lng:6.98988, state:"Anambra", address:"Km33 umoji road nkpor", sector:"Industrial", phone:"08177722234", email:"juddybolema@yahoo.com" },
  { id:"ci031", name:"OMNIK LIMITED", lat:6.57853, lng:3.3605, state:"Lagos", address:"Km18, Ikorodu rd, owode elede, Lagos", sector:"Industrial", phone:"08188770033", email:"omnik@omnik.biz" },
  { id:"ci032", name:"PHOENIX STEEL MILL LTD", lat:7.20538, lng:3.35763, state:"Ogun", address:"Km14, Ikorodu-sagamu rd, ogijo-remo, Ogun State", sector:"Steel / Metals", phone:"08057097642", email:"commercial@phoenixsteelmill.com" },
  { id:"ci033", name:"STAVIAN ENERGY LIMITED", lat:5.38847, lng:7.51009, state:"Abia", address:"Km3, akwete-umugbai rd, akwete", sector:"Energy / Mining", phone:"08033103767", email:"info@stavianenergy.com" },
  { id:"ci034", name:"TAOPEX STEEL LIMITED", lat:7.20271, lng:3.42768, state:"Ogun", address:"Igbata Village, Sagamu, Ogun State", sector:"Steel / Metals", phone:"0834737745", email:"info@taopexenergy.com" },
  { id:"ci035", name:"ATLANTIC METAL INDUSTRIES LTD", lat:6.56342, lng:3.33599, state:"Lagos", address:"20 Oba akin jobi str gra ikeja lagos", sector:"Steel / Metals", phone:"09133067027", email:"atlanticmetal2021@gmail.com" },
  { id:"ci036", name:"IFE IRON AND STEEL NIG LTD", lat:7.56513, lng:4.52642, state:"Osun", address:"Plot39 ogun wusi village, fashina, ife-ibadan exp way, ile ife, osun", sector:"Steel / Metals", phone:"09056877617", email:"atanu.datta@spplpaper.com" },
  { id:"ci037", name:"FEDERAL AIRPORTS AUTHORITY OF NIGERIA (IKEJA)", lat:9.03029, lng:7.52372, state:"Abuja", address:"6 Bissau Street, Wuse Zone 6", sector:"Aviation", phone:"08065334251", email:"yakubu.sule@faan.gov.ng" },
  { id:"ci038", name:"ZEBERCED LIMITED", lat:9.0201, lng:7.55552, state:"Abuja", address:"Plot 1001 off gbazango new ext. Kubwa Abuja", sector:"Industrial", phone:"08151414149", email:"info@zeberced.com" },
  { id:"ci039", name:"CROWN FLOUR MILL LIMITED (KADUNA)", lat:10.47085, lng:7.45102, state:"Kaduna", address:"Km25, along kaduna-abuja exp. Way", sector:"Food & Beverage", phone:"08024654398", email:"somnath.mandal@olamagri.com" },
  { id:"ci040", name:"PZ CUSSONS NIGERIA PLC", lat:6.59551, lng:3.42435, state:"Lagos", address:"NO 45/47, Town Planning Way, Ilupeju, Lagos", sector:"Industrial", phone:"23412773415", email:"pzccommunications@pzcussons.com" },
  { id:"ci041", name:"FRIESLAND CAMPINA WAMCO NIGERIA PLS", lat:6.58974, lng:3.40895, state:"Lagos", address:"Plot 7B, Acme Road Ogba Industrial Estate, Lagos State", sector:"Food & Beverage", phone:"08023180097", email:"adekola.lamidi@frieslandcampina.com" },
  { id:"ci042", name:"NAK STEEL ROLLING AND PROCESSING MILL LTD", lat:13.06427, lng:7.55122, state:"Katsina", address:"Danoume Road, Funtua, Katsina State", sector:"Steel / Metals", phone:"08035555880", email:"naksteelrollingandprocessing@gmail.com" },
  { id:"ci043", name:"QUANTUM STEELS NIGERIA LIMITED", lat:7.14444, lng:3.27148, state:"Ogun", address:"Km16 off Shagamu Ikorodu Road Ewujagun Village, Ogun State", sector:"Steel / Metals", phone:"08150998785", email:"ngupta@qpnlnig.com" },
  { id:"ci044", name:"MONARCH STEEL MILLS LIMITED", lat:7.1381, lng:3.33019, state:"Ogun", address:"12B Shonibare Estate, Maryland, Ikeja, Lagos State", sector:"Steel / Metals", phone:"08072294000", email:"msml.nigeria@gmail.com" },
  { id:"ci045", name:"NIGERIAN BREWERIES PLC (Kaduna)", lat:6.46129, lng:3.37814, state:"Lagos", address:"Iganmu House, Abebe Village Road, Iganmu, Lagos State", sector:"Food & Beverage", phone:"08006000000", email:"info@nbplc.com" },
  { id:"ci046", name:"PAULAZANDA NIGERIA LIMITED", lat:4.77206, lng:6.86969, state:"Rivers", address:"234 Aba PH Express Way, Rumuoga Portharcourt", sector:"Industrial", phone:"08037867831", email:"eaaamadi@yahoo.co.uk" },
  { id:"ci047", name:"SHONGAI TECHNOLOGIES LIMITED", lat:7.10619, lng:3.42129, state:"Ogun", address:"KM40 Lagos Abeokuta Express Way Sango Ota", sector:"Technology", phone:"09073019483", email:"info@shongaitechnologiesltd.com" },
  { id:"ci048", name:"GEEPEE INDUSTRIES NIGERIA LIMITED", lat:7.09189, lng:3.28181, state:"Ogun", address:"KM38 Abeokuta Motor Road, Sango Ota, Ogun State", sector:"Industrial", phone:"08099990250", email:"info@geepeeindustries.com" },
  { id:"ci049", name:"KIARA RICE MILLS LIMITED", lat:10.00642, lng:5.6759, state:"Niger", address:"Kpatsuwa Village km10 Jebba Mokwa Road, Niger State", sector:"Food & Beverage", phone:"08160987445", email:"purchase.ng@pjsglobal.com" },
  { id:"ci050", name:"COVENANT UNIVERSITY CONSULT SERV AND INV CO LTD", lat:7.21634, lng:3.33006, state:"Ogun", address:"KM10 Idiroko Road, Ota Ogun State", sector:"Education", phone:"07061148974", email:"cu.consults@convenantuniversity.edu.ng" },
  { id:"ci051", name:"ORBIT HOT STRIP MILLS LIMITED", lat:7.17609, lng:3.35747, state:"Ogun", address:"KM45, Shagamu Ikorodu Express Way, Ogun State Ogijo", sector:"Steel / Metals", phone:"08072892009", email:"" },
  { id:"ci052", name:"AVATAR NEW ENERGY MATERIALS CO. LTD", lat:8.52747, lng:8.17895, state:"Nasarawa", address:"Kama Otto Road, Nasarawa LGA, Nasarawa State", sector:"Energy / Mining", phone:"09091251798", email:"liu_yingnan@163.com" },
  { id:"ci053", name:"TOWER ALLOYS INDUSTRIES LTD", lat:6.45644, lng:3.3323, state:"Lagos", address:"Plot 9 Oba Akran Avenue, Ikeja", sector:"Steel / Metals", phone:"09068681342", email:"info.toweralloys@toweraig.com" },
  { id:"ci054", name:"NASASUPER PLASTIC INDUSTRY LTD", lat:8.5742, lng:8.27282, state:"Nasarawa", address:"KM16, Keffi Abuja, Gora, Karu", sector:"Manufacturing", phone:"08033225743", email:"abaadesanya@gmail.com" },
  { id:"ci055", name:"TOWER ROLLING AND GALVANIZING MILLS LIMITED", lat:6.47758, lng:3.43679, state:"Lagos", address:"11 Danfodio Street Off Liverpool Road, Apapa Lagos", sector:"Steel / Metals", phone:"09068681342", email:"info@toweraig.com" },
  { id:"ci056", name:"WEST AFRICAN STEEL PROCESSING AND EXPORTS CO LTD", lat:6.53206, lng:3.32596, state:"Lagos", address:"1 Danfodio Street Off Liverpool Road, Apapa Lagos", sector:"Steel / Metals", phone:"09155490485", email:"info@africanindustries.com" },
  { id:"ci057", name:"AFRICAN FOUNDRIES LIMITED (AFL)", lat:7.17455, lng:3.36037, state:"Ogun", address:"KM45 Shagamu Ikorodu Express Way Ogijo, Ogun State", sector:"Industrial", phone:"07015831220", email:"info@africanindustries.com" },
  { id:"ci058", name:"QUALITEC INDUSTRIES LIMITED", lat:6.49998, lng:3.32194, state:"Lagos", address:"679 Lagos Abeokuta Road, Ojokoro Lagos", sector:"Industrial", phone:"09035056665", email:"adeyeye_da@yahoo.com" },
  { id:"ci059", name:"PROFORTE MINING AND RESOURCES LIMITED", lat:6.56516, lng:3.42497, state:"Lagos", address:"NO14A Ajisafe Street, Off Isaac John Ikeja Lagos State", sector:"Energy / Mining", phone:"09071919135", email:"adetunji.adeyeye@taopexenergy.com" },
  { id:"ci060", name:"ER-KANG MINING NIGERIA COMPANY LIMITED", lat:8.9919, lng:4.64307, state:"Kwara", address:"NO2 Haruna Street, Agric Estate, Ilorin, Kwara State", sector:"Energy / Mining", phone:"07032477660", email:"nyemmy@gmail.com" },
  { id:"ci061", name:"LEB OIL NIGERIA LTD", lat:5.7024, lng:5.90046, state:"Delta", address:"NO10 Eboigbe Road, Owa Alero Agbor Delta State", sector:"Energy / Mining", phone:"07032156555", email:"leboil@leboilltd.com" },
];

// ── Geopolitical Zones ───────────────────────────────────────────────────────
export const GEOPOLITICAL_ZONES = {
  "North West":    { color:"#1a3a5c", states:["Kano","Kaduna","Katsina","Kebbi","Sokoto","Zamfara","Jigawa"] },
  "North East":    { color:"#1a4a3a", states:["Borno","Yobe","Adamawa","Gombe","Bauchi","Taraba"] },
  "North Central": { color:"#3a2a5c", states:["Plateau","Benue","Kogi","Kwara","Nasarawa","Niger","FCT"] },
  "South West":    { color:"#5c3a1a", states:["Lagos","Ogun","Oyo","Osun","Ondo","Ekiti"] },
  "South East":    { color:"#5c1a1a", states:["Enugu","Anambra","Imo","Abia","Ebonyi"] },
  "South South":   { color:"#3a4a1a", states:["Rivers","Delta","Edo","Bayelsa","Akwa Ibom","Cross River"] },
};

export function getZoneForState(name) {
  for (const [zone, data] of Object.entries(GEOPOLITICAL_ZONES)) {
    if (data.states.some(s => name.toLowerCase().includes(s.toLowerCase())))
      return { zone, color: data.color };
  }
  return { zone: "Unknown", color: "#1a2535" };
}
