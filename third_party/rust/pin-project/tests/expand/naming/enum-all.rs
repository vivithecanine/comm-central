use pin_project::pin_project;

#[pin_project(project = Proj, project_ref = ProjRef, project_replace = ProjOwn)]
enum Enum<T, U> {
    Struct {
        #[pin]
        pinned: T,
        unpinned: U,
    },
    Tuple(#[pin] T, U),
    Unit,
}

fn main() {}
