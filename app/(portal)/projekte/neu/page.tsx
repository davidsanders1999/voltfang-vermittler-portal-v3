'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  ArrowRight,
  Building,
  CalendarClock,
  Zap,
  User,
  Mail,
  Phone,
  MapPin,
  CheckCircle2,
  Globe,
  Loader2,
  AlertCircle,
  FileText,
  Briefcase,
  Copy
} from 'lucide-react';
import { EstimatedCapacity, GERMAN_STATES, SALUTATIONS } from '@/types';
import { EU_PRIMARY_COUNTRIES, EU_OTHER_COUNTRIES } from '@/lib/countries';
import {
  isValidEmail,
  isValidPhone,
  isValidUrl,
  isValidZip,
  hasMinLength,
  isDateInFuture,
  isValidName,
  ValidationErrors
} from '@/lib/validation';
import { createHubSpotProject } from '@/lib/api/hubspot';
import { usePortalData } from '@/hooks/usePortalData';

export default function ProjektFormularPage() {
  const router = useRouter();
  const { userProfile } = usePortalData();
  const userCompanyId = userProfile?.company_id || null;
  const userId = userProfile?.id || null;

  const [formStep, setFormStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    // Schritt 1: Projektdetails
    name: '',
    description: '',
    estimated_order_date: '',
    estimated_capacity: '' as EstimatedCapacity | '',
    // Schritt 1: Projektstandort
    location_street: '',
    location_zip: '',
    location_city: '',
    location_state: '' as typeof GERMAN_STATES[number] | '',
    location_country: 'Deutschland',
    // Schritt 2: Projektunternehmen
    unternehmen_name: '',
    unternehmen_website: '',
    unternehmen_street: '',
    unternehmen_zip: '',
    unternehmen_city: '',
    unternehmen_state: '' as typeof GERMAN_STATES[number] | '',
    unternehmen_country: 'Deutschland',
    // Schritt 2: Projektkontakt
    kontakt_salutation: '' as typeof SALUTATIONS[number] | '',
    kontakt_fname: '',
    kontakt_lname: '',
    kontakt_rolle_im_unternehmen: '',
    kontakt_email: '',
    kontakt_phone: '',
  });

  const [fieldErrors, setFieldErrors] = useState<ValidationErrors>({});
  const [touchedFields, setTouchedFields] = useState<Set<string>>(new Set());

  const fillTestData = () => {
    const rnd = Math.floor(Math.random() * 900 + 100);
    setFormData({
      name: `Testprojekt Batteriespeicher ${rnd}`,
      description: 'Automatisch generierte Testdaten für Entwicklungszwecke.',
      estimated_order_date: '2026-09-01',
      estimated_capacity: '100 - 500 kWh',
      location_street: 'Musterstraße 12',
      location_zip: '10115',
      location_city: 'Berlin',
      location_state: 'Berlin',
      location_country: 'Deutschland',
      unternehmen_name: `Test GmbH ${rnd}`,
      unternehmen_website: 'https://test-gmbh.de',
      unternehmen_street: 'Industrieweg 5',
      unternehmen_zip: '10117',
      unternehmen_city: 'Berlin',
      unternehmen_state: 'Berlin',
      unternehmen_country: 'Deutschland',
      kontakt_salutation: 'Herr',
      kontakt_fname: 'Max',
      kontakt_lname: 'Mustermann',
      kontakt_rolle_im_unternehmen: 'Geschäftsführer',
      kontakt_email: `max.mustermann${rnd}@test-gmbh.de`,
      kontakt_phone: '+49 30 12345678',
    });
    setFieldErrors({});
    setTouchedFields(new Set());
  };

  const validateStep1 = (): ValidationErrors => {
    const errors: ValidationErrors = {};
    if (!hasMinLength(formData.name, 3)) errors.name = 'Bitte geben Sie einen Projektnamen ein (min. 3 Zeichen)';
    if (!formData.estimated_order_date) {
      errors.estimated_order_date = 'Bitte wählen Sie ein voraussichtliches Bestelldatum';
    } else if (!isDateInFuture(formData.estimated_order_date)) {
      errors.estimated_order_date = 'Das Datum muss in der Zukunft liegen';
    }
    if (!formData.estimated_capacity) errors.estimated_capacity = 'Bitte wählen Sie eine voraussichtliche Kapazität';
    if (!hasMinLength(formData.location_street, 3)) errors.location_street = 'Bitte geben Sie eine Straße ein (min. 3 Zeichen)';
    if (!isValidZip(formData.location_zip)) errors.location_zip = 'Bitte geben Sie eine gültige PLZ ein (4-5 Ziffern)';
    if (!hasMinLength(formData.location_city, 2)) errors.location_city = 'Bitte geben Sie eine Stadt ein (min. 2 Zeichen)';
    if (!formData.location_state) errors.location_state = 'Bitte wählen Sie ein Bundesland';
    if (!formData.location_country) errors.location_country = 'Bitte wählen Sie ein Land';
    return errors;
  };

  const validateStep2 = (): ValidationErrors => {
    const errors: ValidationErrors = {};
    if (!hasMinLength(formData.unternehmen_name, 2)) errors.unternehmen_name = 'Bitte geben Sie einen Unternehmensnamen ein (min. 2 Zeichen)';
    if (!hasMinLength(formData.unternehmen_street, 3)) errors.unternehmen_street = 'Bitte geben Sie eine Straße ein (min. 3 Zeichen)';
    if (!isValidZip(formData.unternehmen_zip)) errors.unternehmen_zip = 'Bitte geben Sie eine gültige PLZ ein (4-5 Ziffern)';
    if (!hasMinLength(formData.unternehmen_city, 2)) errors.unternehmen_city = 'Bitte geben Sie eine Stadt ein (min. 2 Zeichen)';
    if (!formData.unternehmen_state) errors.unternehmen_state = 'Bitte wählen Sie ein Bundesland';
    if (!formData.unternehmen_country) errors.unternehmen_country = 'Bitte wählen Sie ein Land';
    if (!formData.kontakt_salutation) errors.kontakt_salutation = 'Bitte wählen Sie eine Anrede';
    if (!isValidName(formData.kontakt_fname)) errors.kontakt_fname = 'Bitte geben Sie einen gültigen Vornamen ein (min. 2 Zeichen)';
    if (!isValidName(formData.kontakt_lname)) errors.kontakt_lname = 'Bitte geben Sie einen gültigen Nachnamen ein (min. 2 Zeichen)';
    if (!hasMinLength(formData.kontakt_rolle_im_unternehmen, 2)) errors.kontakt_rolle_im_unternehmen = 'Bitte geben Sie eine Rolle an (min. 2 Zeichen)';
    if (!isValidEmail(formData.kontakt_email)) errors.kontakt_email = 'Bitte geben Sie eine gültige E-Mail-Adresse ein';
    if (formData.kontakt_phone && !isValidPhone(formData.kontakt_phone)) errors.kontakt_phone = 'Bitte geben Sie eine gültige Telefonnummer ein';
    return errors;
  };

  const validateField = (name: string, value: string): string | undefined => {
    switch (name) {
      case 'name': return hasMinLength(value, 3) ? undefined : 'Min. 3 Zeichen erforderlich';
      case 'estimated_order_date':
        if (!value) return 'Bitte Datum auswählen';
        return isDateInFuture(value) ? undefined : 'Datum muss in der Zukunft liegen';
      case 'estimated_capacity': return value ? undefined : 'Bitte Kapazität auswählen';
      case 'location_street': return hasMinLength(value, 3) ? undefined : 'Min. 3 Zeichen erforderlich';
      case 'location_zip': return isValidZip(value) ? undefined : 'PLZ: 4-5 Ziffern';
      case 'location_city': return hasMinLength(value, 2) ? undefined : 'Min. 2 Zeichen erforderlich';
      case 'location_state': return value ? undefined : 'Bitte Bundesland auswählen';
      case 'location_country': return value ? undefined : 'Bitte Land auswählen';
      case 'unternehmen_name': return hasMinLength(value, 2) ? undefined : 'Min. 2 Zeichen erforderlich';
      case 'unternehmen_street': return hasMinLength(value, 3) ? undefined : 'Min. 3 Zeichen erforderlich';
      case 'unternehmen_zip': return isValidZip(value) ? undefined : 'PLZ: 4-5 Ziffern';
      case 'unternehmen_city': return hasMinLength(value, 2) ? undefined : 'Min. 2 Zeichen erforderlich';
      case 'unternehmen_state': return value ? undefined : 'Bitte Bundesland auswählen';
      case 'unternehmen_country': return value ? undefined : 'Bitte Land auswählen';
      case 'kontakt_salutation': return value ? undefined : 'Bitte Anrede auswählen';
      case 'kontakt_fname': return isValidName(value) ? undefined : 'Ungültiger Vorname (min. 2 Zeichen)';
      case 'kontakt_lname': return isValidName(value) ? undefined : 'Ungültiger Nachname (min. 2 Zeichen)';
      case 'kontakt_rolle_im_unternehmen': return hasMinLength(value, 2) ? undefined : 'Min. 2 Zeichen erforderlich';
      case 'kontakt_email': return isValidEmail(value) ? undefined : 'Ungültige E-Mail-Adresse';
      case 'kontakt_phone': return !value || isValidPhone(value) ? undefined : 'Ungültige Telefonnummer';
      default: return undefined;
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (touchedFields.has(name)) {
      const error = validateField(name, value);
      setFieldErrors(prev => ({ ...prev, [name]: error }));
    }
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setTouchedFields(prev => new Set(prev).add(name));
    const error = validateField(name, value);
    setFieldErrors(prev => ({ ...prev, [name]: error }));
  };

  const copyStandortToUnternehmen = () => {
    setFormData(prev => ({
      ...prev,
      unternehmen_street: prev.location_street,
      unternehmen_zip: prev.location_zip,
      unternehmen_city: prev.location_city,
      unternehmen_state: prev.location_state,
      unternehmen_country: prev.location_country,
    }));
    setFieldErrors(prev => {
      const next = { ...prev };
      const errStreet = validateField('unternehmen_street', formData.location_street);
      const errZip = validateField('unternehmen_zip', formData.location_zip);
      const errCity = validateField('unternehmen_city', formData.location_city);
      const errState = validateField('unternehmen_state', formData.location_state);
      const errCountry = validateField('unternehmen_country', formData.location_country);
      if (errStreet) next.unternehmen_street = errStreet; else delete next.unternehmen_street;
      if (errZip) next.unternehmen_zip = errZip; else delete next.unternehmen_zip;
      if (errCity) next.unternehmen_city = errCity; else delete next.unternehmen_city;
      if (errState) next.unternehmen_state = errState; else delete next.unternehmen_state;
      if (errCountry) next.unternehmen_country = errCountry; else delete next.unternehmen_country;
      return next;
    });
  };

  const standortIsFilled = formData.location_street.trim().length >= 3 && isValidZip(formData.location_zip) && formData.location_city.trim().length >= 2 && formData.location_state && formData.location_country;

  const handleNext = (e: React.FormEvent) => {
    e.preventDefault();
    if (formStep === 1) {
      const errors = validateStep1();
      const fields = ['name', 'estimated_order_date', 'estimated_capacity', 'location_street', 'location_zip', 'location_city', 'location_state', 'location_country'];
      if (Object.keys(errors).length > 0) {
        setFieldErrors(prev => ({ ...prev, ...errors }));
        setTouchedFields(prev => new Set([...prev, ...fields]));
        return;
      }
      setFormStep(2);
    } else {
      const errors = validateStep2();
      const fields = ['unternehmen_name', 'unternehmen_street', 'unternehmen_zip', 'unternehmen_city', 'unternehmen_state', 'unternehmen_country', 'kontakt_salutation', 'kontakt_fname', 'kontakt_lname', 'kontakt_rolle_im_unternehmen', 'kontakt_email', 'kontakt_phone'];
      if (Object.keys(errors).length > 0) {
        setFieldErrors(prev => ({ ...prev, ...errors }));
        setTouchedFields(prev => new Set([...prev, ...fields]));
        return;
      }
      handleCreateProject();
    }
  };

  const handleCreateProject = async () => {
    setLoading(true);
    setSubmitError(null);
    try {
      if (!userCompanyId || !userId) {
        throw new Error('Benutzer- oder Unternehmenskontext fehlt.');
      }

      await createHubSpotProject({
        name: formData.name,
        description: formData.description.trim() || undefined,
        estimated_order_date: formData.estimated_order_date || undefined,
        estimated_capacity: formData.estimated_capacity || undefined,
        location_street: formData.location_street,
        location_zip: formData.location_zip,
        location_city: formData.location_city,
        location_state: formData.location_state,
        location_country: formData.location_country,
        unternehmen_name: formData.unternehmen_name,
        unternehmen_website: formData.unternehmen_website || undefined,
        unternehmen_street: formData.unternehmen_street,
        unternehmen_zip: formData.unternehmen_zip,
        unternehmen_city: formData.unternehmen_city,
        unternehmen_state: formData.unternehmen_state,
        unternehmen_country: formData.unternehmen_country,
        kontakt_salutation: formData.kontakt_salutation,
        kontakt_fname: formData.kontakt_fname,
        kontakt_lname: formData.kontakt_lname,
        kontakt_email: formData.kontakt_email,
        kontakt_phone: formData.kontakt_phone,
        kontakt_rolle_im_unternehmen: formData.kontakt_rolle_im_unternehmen,
      });
      router.push('/projekte');
    } catch (error) {
      console.error('Fehler beim Erstellen des Projekts:', error);
      let message = 'Fehler beim Speichern. Bitte versuchen Sie es erneut.';
      const maybeContext = (error as { context?: { text?: () => Promise<string> } })?.context;

      if (maybeContext?.text) {
        try {
          const bodyText = await maybeContext.text();
          const parsed = JSON.parse(bodyText) as { error?: string };
          const backendError = parsed?.error;
          if (backendError) {
            const normalizedError = backendError.toLowerCase();
            const looksLikeEmailValidationError =
              normalizedError.includes('not a valid email') ||
              normalizedError.includes('invalid email') ||
              normalizedError.includes('email') && normalizedError.includes('valid');

            if (looksLikeEmailValidationError) {
              message = 'Die eingegebene E-Mail-Adresse ist ungültig. Bitte prüfen Sie die Schreibweise und geben Sie eine gültige E-Mail-Adresse ein.';
            } else {
              message = backendError;
            }
          }
        } catch {
          // Fallback auf allgemeine Fehlermeldung.
        }
      }

      setSubmitError(message);
    } finally {
      setLoading(false);
    }
  };

  const inputClass = (field: string) =>
    `w-full px-4 py-2.5 bg-slate-50 border rounded-xl focus:ring-4 outline-none font-bold text-xs text-slate-700 ${fieldErrors[field] ? 'border-red-300 focus:ring-red-100 focus:border-red-400' : 'border-slate-200 focus:ring-[#82a8a4]/10 focus:border-[#82a8a4]'}`;

  const inputIconClass = (field: string) =>
    `w-full pl-11 pr-4 py-2.5 bg-slate-50 border rounded-xl focus:ring-4 outline-none font-bold text-xs text-slate-700 ${fieldErrors[field] ? 'border-red-300 focus:ring-red-100 focus:border-red-400' : 'border-slate-200 focus:ring-[#82a8a4]/10 focus:border-[#82a8a4]'}`;

  const iconClass = (field: string) =>
    `absolute left-4 top-1/2 -translate-y-1/2 transition-colors ${fieldErrors[field] ? 'text-red-400' : 'text-slate-400 group-focus-within:text-[#82a8a4]'}`;

  const errMsg = (field: string) =>
    fieldErrors[field] ? <p className="text-[10px] text-red-500 font-medium ml-1 flex items-center gap-1"><AlertCircle size={10} />{fieldErrors[field]}</p> : null;

  const label = (text: string, required = true) => (
    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">
      {text}{!required && <span className="text-slate-300 ml-1">(optional)</span>}
    </label>
  );

  const sectionHeader = (Icon: React.ElementType, title: string, accent = false) => (
    <div className="flex items-center gap-2.5 mb-1">
      <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${accent ? 'bg-[#82a8a4] text-white' : 'bg-[#82a8a4]/10 text-[#82a8a4]'}`}>
        <Icon size={13} />
      </div>
      <h2 className="font-semibold text-xs text-slate-700 tracking-tight">{title}</h2>
    </div>
  );

  const germanStateOptions = GERMAN_STATES.map(s => (
    <option key={s} value={s}>{s}</option>
  ));

  const countryOptions = (
    <>
      <option value="">Land auswählen...</option>
      {EU_PRIMARY_COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
      <option disabled>──────────</option>
      {EU_OTHER_COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
    </>
  );

  return (
    <div className="max-w-xl mx-auto ">
      <div className="flex items-center justify-between mb-5">
        <button
          onClick={() => router.push('/projekte')}
          className="flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-slate-700 transition-colors"
        >
          <ArrowLeft size={13} /> Zurück zur Liste
        </button>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={fillTestData}
            className="flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-semibold text-amber-600 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 transition-colors"
          >
            <Copy size={10} /> Testdaten
          </button>
          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Schritt {formStep} von 2</span>
        </div>
      </div>

      <div className="bg-white rounded-3xl shadow-lg shadow-slate-200/50 border border-slate-100 overflow-hidden">
        <div className="p-6 md:p-8">
          {/* Progress bar */}
          <div className="flex gap-1.5 mb-7">
            {[1, 2].map(i => (
              <div key={i} className={`h-1 flex-1 rounded-full transition-all duration-500 ${formStep >= i ? 'bg-[#82a8a4]' : 'bg-slate-100'}`} />
            ))}
          </div>

          <form onSubmit={handleNext} className="space-y-5">

            {/* SCHRITT 1: PROJEKT & STANDORT */}
            {formStep === 1 && (
              <div className="space-y-5 ">

                {/* Projektdetails */}
                <div className="space-y-4">
                  {sectionHeader(FileText, 'Projektdetails', true)}

                  <div className="space-y-1.5">
                    {label('Projektname')}
                    <input
                      type="text"
                      name="name"
                      value={formData.name}
                      onChange={handleChange}
                      onBlur={handleBlur}
                      placeholder="z.B. Logistikzentrum Nord Erweiterung"
                      className={inputClass('name')}
                    />
                    {errMsg('name')}
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      {label('Vorauss. Bestelldatum')}
                      <div className="relative group">
                        <CalendarClock className={iconClass('estimated_order_date')} size={14} />
                        <input
                          type="date"
                          name="estimated_order_date"
                          value={formData.estimated_order_date}
                          onChange={handleChange}
                          onBlur={handleBlur}
                          min={new Date().toISOString().split('T')[0]}
                          className={inputIconClass('estimated_order_date')}
                        />
                      </div>
                      {errMsg('estimated_order_date')}
                    </div>
                    <div className="space-y-1.5">
                      {label('Vorauss. Kapazität')}
                      <div className="relative group">
                        <Zap className={`${iconClass('estimated_capacity')} pointer-events-none`} size={14} />
                        <select
                          name="estimated_capacity"
                          value={formData.estimated_capacity}
                          onChange={handleChange}
                          onBlur={handleBlur}
                          className={`${inputIconClass('estimated_capacity')} appearance-none cursor-pointer`}
                        >
                          <option value="">Kapazität wählen...</option>
                          <option value="100 - 500 kWh">100 - 500 kWh</option>
                          <option value="500 - 1000 kWh">500 - 1000 kWh</option>
                          <option value="1000 - 5000 kWh">1000 - 5000 kWh</option>
                          <option value=">5000 kWh">{'>5000 kWh'}</option>
                        </select>
                      </div>
                      {errMsg('estimated_capacity')}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    {label('Sonstige Projektinformationen', false)}
                    <textarea
                      name="description"
                      value={formData.description}
                      onChange={handleChange}
                      onBlur={handleBlur}
                      rows={4}
                      maxLength={2000}
                      placeholder="Optionale Zusatzinfos zum Projekt (z.B. Besonderheiten, Hinweise, technische Randbedingungen)"
                      className={`${inputClass('description')} resize-y min-h-[96px]`}
                    />
                    <div className="flex justify-between items-center">
                      {errMsg('description')}
                      <span className="text-[10px] text-slate-400 ml-auto">
                        {formData.description.length}/2000
                      </span>
                    </div>
                  </div>
                </div>

                {/* Projektstandort */}
                <div className="space-y-4 pt-5 border-t border-slate-100">
                  {sectionHeader(MapPin, 'Projektstandort')}

                  <div className="space-y-1.5">
                    {label('Straße & Hausnummer')}
                    <div className="relative group">
                      <MapPin className={iconClass('location_street')} size={14} />
                      <input
                        type="text"
                        name="location_street"
                        value={formData.location_street}
                        onChange={handleChange}
                        onBlur={handleBlur}
                        placeholder="z.B. Gewerbestraße 42"
                        className={inputIconClass('location_street')}
                      />
                    </div>
                    {errMsg('location_street')}
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-1.5">
                      {label('PLZ')}
                      <input
                        type="text"
                        name="location_zip"
                        value={formData.location_zip}
                        onChange={handleChange}
                        onBlur={handleBlur}
                        placeholder="10115"
                        maxLength={5}
                        className={inputClass('location_zip')}
                      />
                      {errMsg('location_zip')}
                    </div>
                    <div className="space-y-1.5 col-span-2">
                      {label('Stadt')}
                      <input
                        type="text"
                        name="location_city"
                        value={formData.location_city}
                        onChange={handleChange}
                        onBlur={handleBlur}
                        placeholder="Berlin"
                        className={inputClass('location_city')}
                      />
                      {errMsg('location_city')}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      {label('Bundesland')}
                      <select
                        name="location_state"
                        value={formData.location_state}
                        onChange={handleChange}
                        onBlur={handleBlur}
                        className={`${inputClass('location_state')} appearance-none cursor-pointer`}
                      >
                        <option value="">Bundesland wählen...</option>
                        {germanStateOptions}
                      </select>
                      {errMsg('location_state')}
                    </div>
                    <div className="space-y-1.5">
                      {label('Land')}
                      <select
                        name="location_country"
                        value={formData.location_country}
                        onChange={handleChange}
                        onBlur={handleBlur}
                        className={`${inputClass('location_country')} appearance-none cursor-pointer`}
                      >
                        {countryOptions}
                      </select>
                      {errMsg('location_country')}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* SCHRITT 2: PROJEKTUNTERNEHMEN & PROJEKTKONTAKT */}
            {formStep === 2 && (
              <div className="space-y-5 ">

                {/* Projektunternehmen */}
                <div className="space-y-4">
                  {sectionHeader(Building, 'Projektunternehmen', true)}

                  <div className="space-y-1.5">
                    {label('Unternehmensname')}
                    <div className="relative group">
                      <Building className={iconClass('unternehmen_name')} size={14} />
                      <input
                        type="text"
                        name="unternehmen_name"
                        value={formData.unternehmen_name}
                        onChange={handleChange}
                        onBlur={handleBlur}
                        placeholder="Muster GmbH"
                        className={inputIconClass('unternehmen_name')}
                      />
                    </div>
                    {errMsg('unternehmen_name')}
                  </div>

                  <div className="space-y-1.5">
                    {label('Website', false)}
                    <div className="relative group">
                      <Globe className={iconClass('unternehmen_website')} size={14} />
                      <input
                        type="text"
                        name="unternehmen_website"
                        value={formData.unternehmen_website}
                        onChange={handleChange}
                        onBlur={handleBlur}
                        placeholder="https://www.unternehmen.de"
                        className={inputIconClass('unternehmen_website')}
                      />
                    </div>
                    {errMsg('unternehmen_website')}
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      {label('Straße & Hausnummer')}
                      <button
                        type="button"
                        onClick={copyStandortToUnternehmen}
                        disabled={!standortIsFilled}
                        className="text-[10px] font-medium text-slate-400 hover:text-[#82a8a4] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:text-slate-400 transition-colors whitespace-nowrap flex items-center gap-1"
                        title={standortIsFilled ? 'Adresse aus Schritt 1 übernehmen' : 'Projektstandort in Schritt 1 ausfüllen'}
                      >
                        <Copy size={10} />
                        Wie Projektstandort
                      </button>
                    </div>
                    <div className="relative group">
                      <MapPin className={iconClass('unternehmen_street')} size={14} />
                      <input
                        type="text"
                        name="unternehmen_street"
                        value={formData.unternehmen_street}
                        onChange={handleChange}
                        onBlur={handleBlur}
                        placeholder="Musterstraße 1"
                        className={inputIconClass('unternehmen_street')}
                      />
                    </div>
                    {errMsg('unternehmen_street')}
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-1.5">
                      {label('PLZ')}
                      <input
                        type="text"
                        name="unternehmen_zip"
                        value={formData.unternehmen_zip}
                        onChange={handleChange}
                        onBlur={handleBlur}
                        placeholder="10115"
                        maxLength={5}
                        className={inputClass('unternehmen_zip')}
                      />
                      {errMsg('unternehmen_zip')}
                    </div>
                    <div className="space-y-1.5 col-span-2">
                      {label('Stadt')}
                      <input
                        type="text"
                        name="unternehmen_city"
                        value={formData.unternehmen_city}
                        onChange={handleChange}
                        onBlur={handleBlur}
                        placeholder="Berlin"
                        className={inputClass('unternehmen_city')}
                      />
                      {errMsg('unternehmen_city')}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      {label('Bundesland')}
                      <select
                        name="unternehmen_state"
                        value={formData.unternehmen_state}
                        onChange={handleChange}
                        onBlur={handleBlur}
                        className={`${inputClass('unternehmen_state')} appearance-none cursor-pointer`}
                      >
                        <option value="">Bundesland wählen...</option>
                        {germanStateOptions}
                      </select>
                      {errMsg('unternehmen_state')}
                    </div>
                    <div className="space-y-1.5">
                      {label('Land')}
                      <select
                        name="unternehmen_country"
                        value={formData.unternehmen_country}
                        onChange={handleChange}
                        onBlur={handleBlur}
                        className={`${inputClass('unternehmen_country')} appearance-none cursor-pointer`}
                      >
                        {countryOptions}
                      </select>
                      {errMsg('unternehmen_country')}
                    </div>
                  </div>
                </div>

                {/* Projektkontakt */}
                <div className="space-y-4 pt-5 border-t border-slate-100">
                  {sectionHeader(User, 'Projektkontakt')}

                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-1.5">
                      {label('Anrede')}
                      <select
                        name="kontakt_salutation"
                        value={formData.kontakt_salutation}
                        onChange={handleChange}
                        onBlur={handleBlur}
                        className={`${inputClass('kontakt_salutation')} appearance-none cursor-pointer`}
                      >
                        <option value="">Anrede...</option>
                        {SALUTATIONS.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                      {errMsg('kontakt_salutation')}
                    </div>
                    <div className="space-y-1.5">
                      {label('Vorname')}
                      <div className="relative group">
                        <User className={iconClass('kontakt_fname')} size={14} />
                        <input
                          type="text"
                          name="kontakt_fname"
                          value={formData.kontakt_fname}
                          onChange={handleChange}
                          onBlur={handleBlur}
                          placeholder="Max"
                          className={inputIconClass('kontakt_fname')}
                        />
                      </div>
                      {errMsg('kontakt_fname')}
                    </div>
                    <div className="space-y-1.5">
                      {label('Nachname')}
                      <div className="relative group">
                        <User className={iconClass('kontakt_lname')} size={14} />
                        <input
                          type="text"
                          name="kontakt_lname"
                          value={formData.kontakt_lname}
                          onChange={handleChange}
                          onBlur={handleBlur}
                          placeholder="Mustermann"
                          className={inputIconClass('kontakt_lname')}
                        />
                      </div>
                      {errMsg('kontakt_lname')}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    {label('Rolle im Unternehmen')}
                    <div className="relative group">
                      <Briefcase className={iconClass('kontakt_rolle_im_unternehmen')} size={14} />
                      <input
                        type="text"
                        name="kontakt_rolle_im_unternehmen"
                        value={formData.kontakt_rolle_im_unternehmen}
                        onChange={handleChange}
                        onBlur={handleBlur}
                        placeholder="z.B. Geschäftsführer, Einkaufsleiter"
                        className={inputIconClass('kontakt_rolle_im_unternehmen')}
                      />
                    </div>
                    {errMsg('kontakt_rolle_im_unternehmen')}
                  </div>

                  <div className="space-y-1.5">
                    {label('E-Mail')}
                    <div className="relative group">
                      <Mail className={iconClass('kontakt_email')} size={14} />
                      <input
                        type="email"
                        name="kontakt_email"
                        value={formData.kontakt_email}
                        onChange={handleChange}
                        onBlur={handleBlur}
                        placeholder="kontakt@unternehmen.de"
                        className={inputIconClass('kontakt_email')}
                      />
                    </div>
                    {errMsg('kontakt_email')}
                  </div>

                  <div className="space-y-1.5">
                    {label('Telefon', false)}
                    <div className="relative group">
                      <Phone className={iconClass('kontakt_phone')} size={14} />
                      <input
                        type="tel"
                        name="kontakt_phone"
                        value={formData.kontakt_phone}
                        onChange={handleChange}
                        onBlur={handleBlur}
                        placeholder="+49 123 4567890"
                        className={inputIconClass('kontakt_phone')}
                      />
                    </div>
                    {errMsg('kontakt_phone')}
                  </div>
                </div>
              </div>
            )}

            {/* Navigation */}
            <div className="flex justify-between items-center pt-4">
              {formStep > 1 ? (
                <button
                  type="button"
                  onClick={() => setFormStep(1)}
                  className="flex items-center gap-1.5 text-xs font-bold text-slate-400 hover:text-slate-800 transition-colors"
                >
                  <ArrowLeft size={14} /> Zurück
                </button>
              ) : (
                <div></div>
              )}

              {formStep === 1 ? (
                <button
                  type="submit"
                  className="bg-[#82a8a4] hover:bg-[#72938f] text-white font-bold px-6 py-2.5 rounded-xl shadow-lg shadow-[#82a8a4]/20 flex items-center gap-1.5 text-xs transition-all active:scale-95"
                >
                  Weiter <ArrowRight size={14} />
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={loading}
                  className="bg-slate-900 hover:bg-slate-800 text-white font-bold px-6 py-2.5 rounded-xl shadow-lg text-xs transition-all active:scale-95 disabled:opacity-70 flex items-center gap-1.5"
                >
                  {loading ? (
                    <>Wird gespeichert... <Loader2 className="animate-spin" size={14} /></>
                  ) : (
                    <>Projekt erstellen <CheckCircle2 size={14} /></>
                  )}
                </button>
              )}
            </div>

            {submitError && (
              <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700 flex items-start gap-2">
                <AlertCircle size={14} className="shrink-0 mt-0.5" />
                <span>{submitError}</span>
              </div>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}
