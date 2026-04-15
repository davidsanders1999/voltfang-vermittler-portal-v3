export interface UserSeed {
  email: string;
  password: string;
  salutation: string;
  fname: string;
  lname: string;
  rolle_im_unternehmen: string;
  phone: string;
}

export interface CompanySeed {
  name: string;
  branche_partner: string;
  street: string;
  zip: string;
  city: string;
  bundesland: string;
  country: string;
  website: string;
}

export interface ProjectSeed {
  name: string;
  description: string;
  estimated_order_date: string;
  estimated_capacity: string;
  location_street: string;
  location_zip: string;
  location_city: string;
  location_state: string;
  unternehmen_name: string;
  unternehmen_website: string;
  unternehmen_street: string;
  unternehmen_zip: string;
  unternehmen_city: string;
  unternehmen_state: string;
  kontakt_salutation: string;
  kontakt_fname: string;
  kontakt_lname: string;
  kontakt_rolle_im_unternehmen: string;
  kontakt_email: string;
  kontakt_phone: string;
}

export interface E2EScenario {
  timestamp: number;
  emailPrefix: string;
  users: [UserSeed, UserSeed, UserSeed];
  company: CompanySeed;
  projects: [ProjectSeed, ProjectSeed, ProjectSeed];
}

export function createScenario(prefix: string): E2EScenario {
  const timestamp = Date.now();
  const emailPrefix = `${prefix}.${timestamp}`;
  const domain = 'mailinator.com';

  return {
    timestamp,
    emailPrefix,
    users: [
      {
        email: `${emailPrefix}.owner@${domain}`,
        password: '123456789',
        salutation: 'Herr',
        fname: 'Max',
        lname: 'Mustermann',
        rolle_im_unternehmen: 'Geschaeftsfuehrer',
        phone: '+49 123 456789',
      },
      {
        email: `${emailPrefix}.member@${domain}`,
        password: '123456789',
        salutation: 'Frau',
        fname: 'Erika',
        lname: 'Musterfrau',
        rolle_im_unternehmen: 'Vertriebsleiterin',
        phone: '+49 987 654321',
      },
      {
        email: `${emailPrefix}.manual@${domain}`,
        password: '123456789',
        salutation: 'Herr',
        fname: 'Hans',
        lname: 'Hansen',
        rolle_im_unternehmen: 'Ingenieur',
        phone: '+49 111 222333',
      },
    ],
    company: {
      name: `Test Unternehmen ${timestamp}`,
      branche_partner: 'Energieberater',
      street: 'Teststrasse 42',
      zip: '12345',
      city: 'Berlin',
      bundesland: 'Berlin',
      country: 'Deutschland',
      website: 'https://test-unternehmen.de',
    },
    projects: [
      {
        name: `E2E Projekt Alpha ${timestamp}`,
        description: `E2E Zusatzinfo Alpha ${timestamp}: Zugang nur nach Ruecksprache mit dem Betreiber.`,
        estimated_order_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        estimated_capacity: '500 - 1000 kWh',
        location_street: 'Alphastrasse 1',
        location_zip: '10115',
        location_city: 'Berlin',
        location_state: 'Berlin',
        unternehmen_name: 'Alpha Energie GmbH',
        unternehmen_website: 'https://alpha-energie.de',
        unternehmen_street: 'Allee der Kosmonauten 1',
        unternehmen_zip: '12681',
        unternehmen_city: 'Berlin',
        unternehmen_state: 'Berlin',
        kontakt_salutation: 'Frau',
        kontakt_fname: 'Anna',
        kontakt_lname: 'Alpha',
        kontakt_rolle_im_unternehmen: 'Einkaufsleiterin',
        kontakt_email: 'anna@alpha-energie.de',
        kontakt_phone: '+49 30 12345678',
      },
      {
        name: `E2E Projekt Beta ${timestamp}`,
        description: `E2E Zusatzinfo Beta ${timestamp}: Netzanschlusspruefung laeuft.`,
        estimated_order_date: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        estimated_capacity: '1000 - 5000 kWh',
        location_street: 'Betaweg 42',
        location_zip: '80331',
        location_city: 'Muenchen',
        location_state: 'Bayern',
        unternehmen_name: 'Beta Solar AG',
        unternehmen_website: 'https://beta-solar.de',
        unternehmen_street: 'Leopoldstrasse 10',
        unternehmen_zip: '80802',
        unternehmen_city: 'Muenchen',
        unternehmen_state: 'Bayern',
        kontakt_salutation: 'Herr',
        kontakt_fname: 'Bruno',
        kontakt_lname: 'Beta',
        kontakt_rolle_im_unternehmen: 'Projektleiter',
        kontakt_email: 'bruno@beta-solar.de',
        kontakt_phone: '+49 89 98765432',
      },
      {
        name: `E2E Projekt Gamma ${timestamp}`,
        description: `E2E Zusatzinfo Gamma ${timestamp}: Lastprofil vom Endkunden folgt.`,
        estimated_order_date: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        estimated_capacity: '100 - 500 kWh',
        location_street: 'Gammagasse 7',
        location_zip: '50667',
        location_city: 'Koeln',
        location_state: 'Nordrhein-Westfalen',
        unternehmen_name: 'Gamma Grid GmbH',
        unternehmen_website: 'https://gamma-grid.de',
        unternehmen_street: 'Domplatz 2',
        unternehmen_zip: '50667',
        unternehmen_city: 'Koeln',
        unternehmen_state: 'Nordrhein-Westfalen',
        kontakt_salutation: 'Herr',
        kontakt_fname: 'Gerrit',
        kontakt_lname: 'Gamma',
        kontakt_rolle_im_unternehmen: 'Technischer Leiter',
        kontakt_email: 'gerrit@gamma-grid.de',
        kontakt_phone: '+49 221 123456',
      },
    ],
  };
}
