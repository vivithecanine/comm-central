use pin_project::pin_project;

#[pin_project(project = Proj, project_ref = ProjRef, project_replace = ProjOwn)]
struct TupleStruct<T, U>(#[pin] T, U);

fn main() {}
