import { useState } from "react";

const addYears = (dateISO, years) => {
  const d = new Date(dateISO);
  d.setFullYear(d.getFullYear() + years);
  return d.toISOString().slice(0, 10);
};

const todayISO = () => new Date().toISOString().slice(0, 10);

const makeServiceJobsFromUnits = (units) =>
  units.map((u) => {
    const firstSchedule = addYears(u.installationDate, 1);
    return {
      id: `${u.id}-1`,
      unitId: u.id,
      scheduledDate: firstSchedule,
      status: new Date(firstSchedule) < new Date() ? "vencido" : "pendiente",
      attendedAt: null,
      notes: "",
    };
  });

export default function useServices(initialUnits) {
  const [units] = useState(initialUnits);
  const [jobs, setJobs] = useState(makeServiceJobsFromUnits(initialUnits));

  const attendJob = (jobId) => {
    setJobs((prev) =>
      prev.map((j) =>
        j.id === jobId
          ? { ...j, status: "atendido", attendedAt: new Date().toISOString() }
          : j
      )
    );
    const job = jobs.find((j) => j.id === jobId);
    if (!job) return;
    const nextId = `${job.unitId}-${Math.floor(Math.random() * 100000)}`;
    setJobs((prev) => [
      ...prev,
      {
        id: nextId,
        unitId: job.unitId,
        scheduledDate: addYears(job.scheduledDate, 1),
        status: "pendiente",
        attendedAt: null,
        notes: "(auto) Próximo servicio programado",
      },
    ]);
  };

  const markOverdues = () => {
    setJobs((prev) =>
      prev.map((j) => {
        if (j.status === "pendiente" && new Date(j.scheduledDate) < new Date()) {
          return { ...j, status: "vencido" };
        }
        return j;
      })
    );
  };

  return { units, jobs, attendJob, markOverdues };
}
