import { z } from "zod";

// Every field nullable: SDS documents vary wildly in completeness.
const ns = () => z.string().nullable();

const supplier = z
  .object({
    name: ns(),
    address: ns(),
    phone: ns(),
    emergencyPhone: ns(),
  })
  .partial()
  .nullable();

const component = z.object({
  name: ns(),
  casNumber: ns(),
  ecNumber: ns(),
  concentration: ns(),
});

const statement = z.object({ code: ns(), text: ns() });

export const SdsExtractionSchema = z
  .object({
    identification: z
      .object({
        productName: ns(),
        productCode: ns(),
        recommendedUse: ns(),
        supplier,
      })
      .partial()
      .nullable(),
    hazardsIdentification: z
      .object({
        ghsClassification: z.array(z.string()).nullable(),
        signalWord: ns(),
        hazardStatements: z.array(statement).nullable(),
        precautionaryStatements: z.array(statement).nullable(),
        pictograms: z.array(z.string()).nullable(),
      })
      .partial()
      .nullable(),
    composition: z
      .object({ components: z.array(component).nullable() })
      .partial()
      .nullable(),
    firstAidMeasures: z
      .object({
        inhalation: ns(),
        skinContact: ns(),
        eyeContact: ns(),
        ingestion: ns(),
        notesToPhysician: ns(),
      })
      .partial()
      .nullable(),
    fireFighting: z
      .object({
        extinguishingMedia: ns(),
        specificHazards: ns(),
        protectiveEquipment: ns(),
      })
      .partial()
      .nullable(),
    accidentalRelease: z
      .object({
        personalPrecautions: ns(),
        environmentalPrecautions: ns(),
        cleanupMethods: ns(),
      })
      .partial()
      .nullable(),
    handlingAndStorage: z
      .object({
        handling: ns(),
        storage: ns(),
        incompatibleMaterials: ns(),
      })
      .partial()
      .nullable(),
    exposureControls: z
      .object({
        exposureLimits: z
          .array(z.object({ component: ns(), type: ns(), value: ns() }))
          .nullable(),
        engineeringControls: ns(),
        ppe: z
          .object({ eye: ns(), skin: ns(), respiratory: ns() })
          .partial()
          .nullable(),
      })
      .partial()
      .nullable(),
    physicalChemicalProperties: z
      .object({
        appearance: ns(),
        odor: ns(),
        pH: ns(),
        meltingPoint: ns(),
        boilingPoint: ns(),
        flashPoint: ns(),
        flammability: ns(),
        vaporPressure: ns(),
        density: ns(),
        solubility: ns(),
      })
      .partial()
      .nullable(),
    stabilityReactivity: z
      .object({
        reactivity: ns(),
        chemicalStability: ns(),
        hazardousReactions: ns(),
        conditionsToAvoid: ns(),
        incompatibleMaterials: ns(),
        hazardousDecompositionProducts: ns(),
      })
      .partial()
      .nullable(),
    toxicology: z
      .object({
        routesOfExposure: ns(),
        symptoms: ns(),
        acuteToxicity: z
          .array(z.object({ component: ns(), route: ns(), value: ns() }))
          .nullable(),
        chronicEffects: ns(),
        carcinogenicity: ns(),
      })
      .partial()
      .nullable(),
    ecology: z
      .object({
        ecotoxicity: ns(),
        persistenceDegradability: ns(),
        bioaccumulation: ns(),
        mobility: ns(),
      })
      .partial()
      .nullable(),
    disposal: z
      .object({
        wasteTreatmentMethods: ns(),
        contaminatedPackaging: ns(),
      })
      .partial()
      .nullable(),
    transport: z
      .object({
        unNumber: ns(),
        properShippingName: ns(),
        transportHazardClass: ns(),
        packingGroup: ns(),
        environmentalHazards: ns(),
      })
      .partial()
      .nullable(),
    regulatory: z
      .object({
        safetyHealthEnvRegulations: ns(),
        chemicalSafetyAssessment: ns(),
      })
      .partial()
      .nullable(),
    otherInformation: z
      .object({
        revisionDate: ns(),
        preparedBy: ns(),
        disclaimers: ns(),
        references: ns(),
      })
      .partial()
      .nullable(),
  })
  .partial();

export type SdsExtraction = z.infer<typeof SdsExtractionSchema>;

export const SDS_SECTION_LABELS: Record<keyof SdsExtraction, string> = {
  identification: "1. Identification",
  hazardsIdentification: "2. Hazards Identification",
  composition: "3. Composition / Ingredients",
  firstAidMeasures: "4. First-Aid Measures",
  fireFighting: "5. Fire-Fighting Measures",
  accidentalRelease: "6. Accidental Release Measures",
  handlingAndStorage: "7. Handling and Storage",
  exposureControls: "8. Exposure Controls / PPE",
  physicalChemicalProperties: "9. Physical and Chemical Properties",
  stabilityReactivity: "10. Stability and Reactivity",
  toxicology: "11. Toxicological Information",
  ecology: "12. Ecological Information",
  disposal: "13. Disposal Considerations",
  transport: "14. Transport Information",
  regulatory: "15. Regulatory Information",
  otherInformation: "16. Other Information",
};

export const EXTRACTION_PROMPT = [
  "You are an expert at reading chemical Safety Data Sheets (SDS) that follow",
  "the 16-section GHS/OSHA HazCom format. Extract the data from the SDS text",
  "below into the provided schema. Use the exact values from the document.",
  "If a field is not present, set it to null — never guess or invent values.",
  "Preserve hazard (H) and precautionary (P) statement codes with their text.",
].join(" ");
